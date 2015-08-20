Firebase.INTERNAL.forceWebSockets();


/*
 * Abstract base class for Firebase social providers.  Classes which inherit
 * from FirebaseSocialProvider must implement following:
 * - set .name property to be the name of the social network, as recognized
 *   by Firebase (e.g. "facebook", not "Facebook").
 * - a getOAuthToken_ method which returns a Promise that fulfills with
 *   an OAuth token for that network
 * - a loadContacts_ method, which should load user profiles and invoke
 *   .addUserProfile_ for each contact.
 * - a .getMyUserProfile_ method, which returns the logged in user's profile.
 */
var FirebaseSocialProvider = function() {
  // Array of {ref :FirebaseRef, eventType :string, callback :Function} objects.
  this.onCallbacks_ = [];

  this.storage = freedom['core.storage']();
};

/*
 * Initialize this.logger using the module name.
 */
FirebaseSocialProvider.prototype.initLogger_ = function(moduleName) {
  this.logger = console;  // Initialize to console if it exists.
  if (typeof freedom !== 'undefined' &&
      typeof freedom.core === 'function') {
    freedom.core().getLogger('[' + moduleName + ']').then(function(log) {
      this.logger = log;
    }.bind(this));
  }
};

/*
 * Login to social network, returns a Promise that fulfills on login.
 * loginOpts must contain an agent and url (url of the Firebase app).
 */
FirebaseSocialProvider.prototype.login = function(loginOpts) {
  if (this.loginState_) {
    return Promise.reject('Already logged in');
  } else if (!loginOpts.agent) {
    return Promise.reject('loginOpts.agent must be set');
  } else if (!loginOpts.url) {
    return Promise.reject('loginOpts.url must be set');
  }

  // TODO: assert that loginOpts.url ends with 1 '/'
  this.baseUrl_ = loginOpts.url;
  this.allUsersUrl_ = this.baseUrl_ + 'v2/' + this.networkName_ + '-users';
  var allUsersRef = new Firebase(this.allUsersUrl_);

  return new Promise(function(fulfillLogin, rejectLogin) {
    this.authenticate_(allUsersRef, loginOpts).then(function(authData) {
      this.setPresence_(true);
      this.setupDetectDisconnect_();

      // Emits my ClientState.
      var myClientState = this.addOrUpdateMyClient_('ONLINE');

      // Fulfill login before starting to load friends.
      fulfillLogin(myClientState);

      // Emits my UserProfile.
      this.addUserProfile_(this.getMyUserProfile_());

      this.loadContacts_();
    }.bind(this)).catch(function(err) {
      this.initState_();
      rejectLogin("Login Failed! " + err);
    }.bind(this));  // end of authenticate_
  }.bind(this));  // end of return new Promise
};

/*
 * Returns a Promise which fulfills with all known ClientStates.
 */
FirebaseSocialProvider.prototype.getClients = function() {
  if (!this.loginState_) {
    return Promise.reject('getClients called when no logged in');
  }
  return Promise.resolve(this.loginState_.clientStates);
};

/*
 * Returns a Promise which fulfills with all known UserProfiles
 */
FirebaseSocialProvider.prototype.getUsers = function() {
  if (!this.loginState_) {
    return Promise.reject('getUsers called when no logged in');
  }
  return Promise.resolve(this.loginState_.userProfiles);
};

/*
 * Sends a message to another clientId.
 */
FirebaseSocialProvider.prototype.sendMessage = function(toClientId, message) {
  if (!this.loginState_.clientStates[toClientId]) {
    this.logger.error('Could not find client ' + toClientId);
    return Promise.reject('Could not find client ' + toClientId);
  }

  // TODO: what if there is a permission error on the firebase side?
  // Permission errors can happen if the friend has never actually run uproxy
  // yet (i.e. they don't have their own inbox setup)
  var toUserId = toClientId.substr(0, toClientId.indexOf('/'));
  var toAgent = toClientId.substr(toClientId.indexOf('/'));
  var friendInboxUrl =
      this.allUsersUrl_ + '/' + this.networkName_ + ':' + toUserId +
      '/friends/' + this.networkName_ + ':' + this.getUserId_() +
      '/inbox/' + toAgent;
  var friendInboxRef = new Firebase(friendInboxUrl);

  // Send message in the format {fromAgent: message}
  // This format is used so that we can monitor the 'child_added' event
  // and get both the fromClientId and message in the same callback
  var messageObj = {};
  messageObj[this.loginState_.agent] = message;
  friendInboxRef.push(messageObj);
  return Promise.resolve();
};

/*
 * Logs out of the social network.
 */
FirebaseSocialProvider.prototype.logout = function() {
  if (!this.loginState_) {
    // User has already logged out.
    return Promise.resolve();
  }

  this.addOrUpdateMyClient_('OFFLINE');

  // Disconnect all callbacks.
  for (var i = 0; i < this.onCallbacks_.length; ++i) {
    this.onCallbacks_[i].ref.off(
        this.onCallbacks_[i].eventType, this.onCallbacks_[i].callback);
  }
  this.onCallbacks_ = [];

  this.setPresence_(false);
  // TODO: we should disconnect all Firebase ref's here, so that we free up
  // some of our Firebase quota.  However if we just call Firebase.goOffline(),
  // additional attempts to login with the same webworker (freedom module)
  // fail (authWithOAuthToken never returns).
  this.initState_();
  return Promise.resolve();
};

/*
 * Initialize's state to remove all login state.
 */
FirebaseSocialProvider.prototype.initState_ = function() {
  this.baseUrl_ = null;
  this.allUsersUrl_ = null;
  this.loginState_ = null;
};

FirebaseSocialProvider.prototype.addFriendDirectory_ = function(friendUserId) {
  var myRefForFriend = new Firebase(
      this.allUsersUrl_ + '/' + this.networkName_ + ':' + this.getUserId_() +
      '/friends/' + this.networkName_ + ':' + friendUserId);
  // use update, not set, to preserve existing data
  myRefForFriend.update({isFriend: true});
};

/*
 * Adds a UserProfile.
 */
FirebaseSocialProvider.prototype.addUserProfile_ = function(friend) {
  if (this.loginState_.userProfiles[friend.userId]) {
    this.logger.warn('addUserProfile called for existing user ', friend);
    return;
  }

  // Ensure that a permanent friend object exists, with the users name.
  // This must be present in order for other friends to properly detect our
  // clients, based on the current Firebase rules configuration.
  this.addFriendDirectory_(friend.userId);

  var myInboxForFriendRef = new Firebase(
      this.allUsersUrl_ + '/' + this.networkName_ + ':' + this.getUserId_() +
      '/friends/' + this.networkName_ + ':' + friend.userId +
      '/inbox/' + this.loginState_.agent);
  myInboxForFriendRef.onDisconnect().remove();

  // Monitor my new inbox.  Note that messages may have already been written to
  // this inbox before this handler is connected if:
  // 1. I login, and broadcast immediately that I'm ONLINE
  // 2. My friend sees that, and immediately sends me a message (e.g. uProxy
  //    instance message) before I've setup my inbox
  // This doesn't create any problems, as the inbox still gets cleared each
  // time we disconnect - so we don't need to worry about ancient messages
  // in the inbox.
  this.on_(myInboxForFriendRef, 'child_added', function(value) {
    value.forEach(function(snapshot) {
      var fromAgent = snapshot.key();
      var message = snapshot.val();
      var clientId = friend.userId + '/' + fromAgent;
      var fromClientState = this.loginState_.clientStates[clientId];
      if (!fromClientState) {
        // We won't have the client yet if the user had never yet signed onto
        // Firebase until after we logged in.  In this case just add a client
        // for them.
        this.logger.info(
            'Got message with unknown client from: ' + friend.userId +
            ', key: ' + fromAgent + ', val: ' + message);
        fromClientState =
            this.addOrUpdateClient_(friend.userId, clientId, 'ONLINE');
      }
      fromClientState.lastSeen = Date.now();
      this.dispatchEvent_(
          'onMessage', {from: fromClientState, message: message});
      snapshot.ref().remove();  // Delete message from Firebase server.
    }.bind(this));
  }.bind(this));

  // Create a userProfile right away.
  this.loginState_.userProfiles[friend.userId] = {
    userId: friend.userId,
    name: friend.name || '',
    lastUpdated: Date.now(),
    url: friend.url || '',
    imageData: friend.imageData || ''
  };
  this.dispatchEvent_(
      'onUserProfile', this.loginState_.userProfiles[friend.userId]);

  // Get and monitor clients for the user.
  // Note that if the friend has never yet signed onto Firebase (i.e. their
  // folder at the directory returned by getClientsUrl_ doesn't exist yet)
  // this will never return any clients.  In that case we will only know
  // about a client when they send us the first message (e.g. instance message
  // in the case of uProxy).
  // This will skip over clients that match the logged in clientId (allowing
  // us to emit onClientState for other clients for the same user but not
  // redundantly for this client).
  var clients = new Firebase(this.getClientsUrl_(friend.userId));
  this.on_(clients, 'child_added', function(snapshot) {
    var clientId = friend.userId + '/' + snapshot.key();
    if (clientId !== this.getClientId_()) {
      this.addOrUpdateClient_(friend.userId, clientId, 'ONLINE');
    }
  }.bind(this));
  this.on_(clients, 'child_removed', function(snapshot) {
    var clientId = friend.userId + '/' + snapshot.key();
    if (clientId !== this.getClientId_()) {
      this.addOrUpdateClient_(friend.userId, clientId, 'OFFLINE');
    }
  }.bind(this));
};

/*
 * Adds a or updates a client.  Returns the modified ClientState object.
 */
FirebaseSocialProvider.prototype.addOrUpdateClient_ =
    function(userId, clientId, status) {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.addOrUpdateClient_: not logged in';
  }
  var clientState = {
    userId: userId,
    clientId: clientId,
    status: status,
    lastUpdated: Date.now(),
    lastSeen: Date.now()
  };
  this.loginState_.clientStates[clientId] = clientState;
  this.dispatchEvent_('onClientState', clientState);
  return clientState;
};

FirebaseSocialProvider.prototype.addOrUpdateMyClient_ = function(status) {
  return this.addOrUpdateClient_(
      this.getUserId_(), this.getClientId_(), status);
};

/*
 * Sets the ONLINE/OFFLINE presence for the logged in client.
 */
FirebaseSocialProvider.prototype.setPresence_ = function(isOnline) {
  // TODO: may want to consider emptying all inboxes for this agent
  // here or in logout.  The inboxes will be removed when we disconnect from
  // Firebase, but we only disconnect when this code is unloaded (e.g. uProxy
  // app or the browser is closed / restarted).
  var clientRef = new Firebase(
      this.getClientsUrl_(this.getUserId_(), this.loginState_.agent));
  if (isOnline) {
    clientRef.set('ONLINE');
    clientRef.onDisconnect().remove();
  } else {
    clientRef.remove();
  }
};

/*
 * Returns the URL where the clients are listed for userId.
 */
FirebaseSocialProvider.prototype.getClientsUrl_ = function(userId, optAgent) {
  return this.allUsersUrl_ + '/' + this.networkName_ + ':' + userId +
      '/clients' + (optAgent ? '/' + optAgent : '');
};

/*
 * Returns the userId for the logged in user, does not include "facebook:",
 * "google:", etc.
 */
FirebaseSocialProvider.prototype.getUserId_ = function() {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.getUserId_: not logged in';
  }
  var provider = this.loginState_.authData.provider;
  return this.loginState_.authData[provider].id;
};

/*
 * Returns the clientId for the logged in user.
 */
FirebaseSocialProvider.prototype.getClientId_ = function() {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.getUserId_: not logged in';
  }
  return this.getUserId_() + '/' + this.loginState_.agent;
};


/*
 * Adds an event listener, and remembers it for disconnection on logout.
 */
FirebaseSocialProvider.prototype.on_ = function(ref, eventType, callback) {
  this.onCallbacks_.push({ref: ref, eventType: eventType, callback: callback});
  ref.on(eventType, callback);
};


FirebaseSocialProvider.prototype.setupDetectDisconnect_ = function() {
  if (!this.loginState_) {
    throw 'FirebaseSocialProvider.setupDetectDisconnect_: not logged in';
  }
  var connectedRef = new Firebase(this.baseUrl_ + '.info/connected');
  this.on_(connectedRef, 'value', function(snapshot) {
    if (!snapshot.val()) {
      this.logger.log('Detected disconnect from Firebase');
      this.logout();
    }
  }.bind(this));
};


FirebaseSocialProvider.prototype.readFriendProfile_ = function(friendUserId) {
  return new Promise(function(F, R) {
    var friendProfileRef = new Firebase(
        this.allUsersUrl_ + '/' + this.networkName_ + ':' + friendUserId + '/profile/');
    friendProfileRef.once('value', function(snapshot) {
      if (!snapshot.exists()) {
        return R('Profile not found for friend ' + friendUserId);
      }
      return F({
          userId: friendUserId,
          name: snapshot.val().name,
          imageData: snapshot.val().imageData
      });
    }.bind(this), function(error) {
      return R(error);
    }.bind(this));
  }.bind(this));
};


/*
 * Loads contacts of the logged in user, and calls this.addUserProfile_
 * and for each contact.
 */
FirebaseSocialProvider.prototype.loadContacts_ = function() {
  var networkPrefix = this.networkName_ + ':';

  var allFriendsRef = new Firebase(
    this.allUsersUrl_ + '/' + networkPrefix + this.getUserId_() + '/friends/');
  // TODO: is on correct or should it be once?
  this.on_(allFriendsRef, 'child_added', function(snapshot) {
    var friendUserId = snapshot.key().substr(networkPrefix.length);
    this.readFriendProfile_(friendUserId).then(function(profile) {
      this.addUserProfile_(profile);
    }.bind(this)).catch(function(e) {
      // There is a race condition where if Alice invites Bob, when Bob accepts
      // the invite and adds himself to Alice's friend directory, Alice will
      // detect him in her /friends directory before she is added to Bob's
      // /friends directory - this results in her being temporarily unable to
      // read his profile.  Hack around this by waiting 1 second for Bob's
      // /friends directory to be updated.
      // TODO: clean up this hack
      setTimeout(function() {
        this.readFriendProfile_(friendUserId).then(function(profile) {
          this.addUserProfile_(profile);
        }.bind(this)).catch(function(e) {
          console.error('Error reading profile for user ' + friendUserId);
        }.bind(this));
      }.bind(this), 1000);
    }.bind(this));
  }.bind(this));
};


FirebaseSocialProvider.prototype.acceptUserInvitation = function(encodedToken) {
  return new Promise(function(F, R) {
    // TODO: try/catch
    var data = JSON.parse(atob(encodedToken));
    console.log('data ', data);

    // Try to write to friends friendRequest folder
    var myUserId = this.getUserId_();
    var myName = this.name;
    var friendUserId = data.userId;
    var friendName = data.name;  // TODO: remove name
    var token = data.token;

    // Sanity check
    if (friendUserId === myUserId) {
      return R('friendId matches self'); // TODO: better error
    }

    var networkPrefix = this.networkName_ + ':';
    var receivedInviteTokensRef = new Firebase(
        this.allUsersUrl_ + '/' + networkPrefix + myUserId +
        '/receivedInviteTokens/' + token);
    receivedInviteTokensRef.set({received: true}, function(error) {
      console.log('pushed');
      if (error) {
        console.error('error writing to receivedInviteTokens');  // should never happen
        return R('error writing to receivedInviteTokens');
      }

      var friendRequestUrl = this.allUsersUrl_ + '/' + networkPrefix +
          friendUserId + '/friends/' + networkPrefix + myUserId + '/inviteResponses/' + token;
      console.log('friendRequestUrl: ' + friendRequestUrl);
      var friendRequestRef = new Firebase(friendRequestUrl);
      friendRequestRef.update({isFriend: true}, function(error) {
        console.log('push to friendRequestRef completed with error ' + error);
        if (error) {
          return R('Not permissioned to add friend');
        }
        F();
        // Add a directory for the friend.  This will trigger an update
        // to the callback in loadContacts_ which will get the friend's
        // profile, start monitoring them and emit an onUserProfile
        this.addFriendDirectory_(friendUserId);
      }.bind(this));
    }.bind(this));
  }.bind(this));
};


FirebaseSocialProvider.prototype.inviteUser = function(ignoredStringParam) {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.inviteUser: not logged in';
  }
  // TODO: clarify name, is it token, code, secret, etc?
  var uid = this.loginState_.authData.uid;
  var permissionToken = Math.floor(Math.random() * 100000000000);
  var tokenUrl = this.allUsersUrl_ + '/' + uid + '/generatedInviteTokens/'+ permissionToken;
  console.log('tokenUrl ' + tokenUrl);
  var tokenRef = new Firebase(tokenUrl);
  tokenRef.set({timestamp: Date.now()});

  // TODO: this userId is the numeric ID, not the name!!!
  // TODO: make userId and name consistent!!
  var jsonString = JSON.stringify(
    {userId: this.getUserId_(), token: permissionToken, name: this.name});
  return Promise.resolve({token: btoa(jsonString)});
};


FirebaseSocialProvider.prototype.authenticate_ = function(firebaseRef, loginOpts) {
  return new Promise(function(fulfill, reject) {
    this.getOAuthToken_(loginOpts).then(function(token) {
      firebaseRef.authWithOAuthToken(this.networkName_, token,
          function(error, authData) {
        if (error || !authData) {
          return reject(new Error('OAuth failed ' + error));
        }

        this.loginState_ = {
          authData: authData,
          userProfiles: {},  // map from userId to userProfile
          clientStates: {},  // map from clientId to clientState
          agent: loginOpts.agent  // Agent string.  Does not include userId.
        };

        // TODO: should these be part of loginState?  or get methods?

        // email may not be available for some providers, e.g. facebook
        this.email = authData[this.networkName_].email;
        // displayName may not be set for Google users without a G+ profile
        // in this case email should still be available.
        this.name = authData[this.networkName_].displayName || this.email;
        if (!this.name) {
          return reject(new Error('Could not get name from social network'));
        }

        // Set logged in users profile.
        var profileRef =
            new Firebase(this.allUsersUrl_ + '/' + authData.uid + '/profile');
        profileRef.update({name: this.name, imageData: this.getMyImage_()});

        fulfill(authData);
      }.bind(this));
    }.bind(this));
  }.bind(this));
};

/*
 * Returns UserProfile object for the logged in user.
 */
FirebaseSocialProvider.prototype.getMyUserProfile_ = function() {
  if (!this.loginState_) {
    throw 'Error in FacebookSocialProvider.getMyUserProfile_: not logged in';
  }
  var cachedUserProfile =
      this.loginState_.authData[this.networkName_].cachedUserProfile;
  return {
    userId: this.getUserId_(),
    name: cachedUserProfile.name,
    lastUpdated: Date.now(),
    url: cachedUserProfile.link,
    imageData: this.getMyImage_()
  };
};