Firebase.INTERNAL.forceWebSockets();


/*
 * Abstract base class for Firebase social providers.  Classes which inherit
 * from FirebaseSocialProvider must implement following:
 * - set .name property to be the name of the social network, as recognized
 *   by Firebase (e.g. "facebook", not "Facebook").
 * - a getOAuthToken_ method which returns a Promise that fulfills with
 *   an OAuth token for that network
 * - a loadContacts_ method, which should load user profiles and invoke
 *   .addUserProfile_ and .updateUserProfile_ as needed.
 * - a .getMyUserProfile_ method, which returns the logged in user's profile.
 */
var FirebaseSocialProvider = function() {
  this.onCallbacks_ = [];  // Array of {ref, eventType, callback} objects.
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

  this.baseUrl_ = loginOpts.url + this.networkName_ + '-users';
  var baseRef = new Firebase(this.baseUrl_);

  return new Promise(function(fulfillLogin, rejectLogin) {
    this.getOAuthToken_().then(function(token) {
      baseRef.authWithOAuthToken(this.networkName_, token,
          function(error, authData) {
        if (error) {
          this.initState_();
          rejectLogin("Login Failed! " + error);
          return;
        }

        this.loginState_ = {
          authData: authData,
          userProfiles: {},  // map from userId to userProfile
          clientStates: {},  // map from clientId to clientState
          agent: loginOpts.agent  // Agent string.  Does not include userId.
        };

        this.setPresence_(true);

        // Emits my ClientState.
        var myClientState = this.addOrUpdateClient_(
            this.getUserId_(),
            this.getUserId_() + '/' + this.loginState_.agent,
            'ONLINE');

        // Fulfill login before starting to load friends.
        fulfillLogin(myClientState);

        // Emits my UserProfile.
        this.addUserProfile_(this.getMyUserProfile_());

        this.loadContacts_();
      }.bind(this));  // end of authWithOAuthToken
    }.bind(this));  // end of getOAuthToken_
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
      this.baseUrl_ + '/' + this.networkName_ + ':' + toUserId + '/friends/' +
      this.networkName_ + ':' + this.getUserId_() + '/inbox/' + toAgent;
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
  this.loginState_ = null;
};

/*
 * Adds a UserProfile.
 */
FirebaseSocialProvider.prototype.addUserProfile_ = function(friend) {
  if (this.loginState_.userProfiles[friend.userId]) {
    this.logger.warn('addUserProfile called for existing user ', friend);
    return;
  }

  if (friend.userId == this.getUserId_()) {
    // Add a user profile for ourself and just return.
    // TODO: monitor for all clients except this one.
    // TODO: refactor this so we don't have identical userProfile adding
    // code twice.
    this.loginState_.userProfiles[friend.userId] = {
      userId: friend.userId,
      name: friend.name || '',
      lastUpdated: Date.now(),
      url: friend.url || '',
      imageData: friend.imageData || ''
    };
    this.dispatchEvent_(
        'onUserProfile', this.loginState_.userProfiles[friend.userId]);
    return;
  }

  // Ensure that a permanent friend object exists, with the users name.
  // This must be present in order for other friends to properly detect our
  // clients, based on the current Firebase rules configuration.
  var myRefForFriend = new Firebase(
      this.baseUrl_ + '/' + this.networkName_ + ':' + this.getUserId_() +
      '/friends/' + this.networkName_ + ':' + friend.userId);
  // use update, not set, to preserve existing data
  myRefForFriend.update({isFriend: true});

  // Set an inbox, writable only by my friend, and unique to this
  // agent (client).  This should be cleared when I disconnect.
  var myInboxForFriendRef = myRefForFriend.child(
      'inbox/' + this.loginState_.agent);
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

  // Get and monitor clients for friend.
  // Note that if the friend has never yet signed onto Firebase (i.e. their
  // folder at the directory returned by getClientsUrl_ doesn't exist yet)
  // this will never return any clients.  In that case we will only know
  // about a client when they send us the first message (e.g. instance message
  // in the case of uProxy).
  var clients = new Firebase(this.getClientsUrl_(friend.userId));
  this.on_(clients, 'child_added', function(snapshot) {
    var clientId = friend.userId + '/' + snapshot.key();
    this.addOrUpdateClient_(friend.userId, clientId, 'ONLINE');
  }.bind(this));
  this.on_(clients, 'child_removed', function(snapshot) {
    var clientId = friend.userId + '/' + snapshot.key();
    this.addOrUpdateClient_(friend.userId, clientId, 'OFFLINE');
  }.bind(this));
};

/*
 * Adds a or updates a client.  Returns the modified ClientState object.
 */
FirebaseSocialProvider.prototype.addOrUpdateClient_ =
    function(userId, clientId, status) {
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

/*
 * Updates an existing UserProfile.
 */
FirebaseSocialProvider.prototype.updateUserProfile_ = function(newUserProfile) {
  if (!newUserProfile.userId) {
    this.logger.error('id missing in updateUserProfile_', newUserProfile);
    return;
  } else if (!this.loginState_.userProfiles[newUserProfile.userId]) {
    this.logger.error('User profile not found for ' + newUserProfile.userId);
    return;
  }
  var profile = this.loginState_.userProfiles[newUserProfile.userId];
  profile.name = newUserProfile.name || profile.name;
  profile.url = newUserProfile.url || profile.url;
  profile.imageData = newUserProfile.imageData || profile.imageData;
  profile.lastUpdated = Date.now();
  this.dispatchEvent_('onUserProfile', profile);
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
  return this.baseUrl_ + '/' + this.networkName_ + ':' + userId + '/clients' +
      (optAgent ? '/' + optAgent : '');
};

/*
 * Returns the userId for the logged in user, does not include "facebook:",
 * "google:", etc.
 */
FirebaseSocialProvider.prototype.getUserId_ = function() {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.getUserId_: not logged in';
  }
  return this.loginState_.authData[this.networkName_].id;
};


/*
 * Adds an event listener, and remembers it for disconnection on logout.
 */
FirebaseSocialProvider.prototype.on_ = function(ref, eventType, callback) {
  this.onCallbacks_.push({ref: ref, eventType: eventType, callback: callback});
  ref.on(eventType, callback);
};
