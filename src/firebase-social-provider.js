/*
KNOWN ISSUES:

In uProxy, login to G+, then logout, then login again won't work
Same with FB

My id is not something human readable.  Can we not show it on the uProxy UI:
- log in notification
- settings tab
- we can get email from Firebase at least for G+

scalability: currently only support ~40 simultaneous connections, not
sure how much we can scale

need to remove directories/access for users who are no longer friends

if a user signs in with the same instance name twice things break
we should probably either reject the new sign in attempt, or we should
force sign out the old instance

detect disconnects (pings?)

use "url" in uProxy to help prevent contact spoofing
  - what happens for XMPP contacts with no G+ page?
  - update https://github.com/uProxy/uproxy/issues/412

need to handle proxy starting and stopping (broken internet).  we may need to
reconnect

test that I can't create garbage top level directories, or create a google:xxx directory for someone

LACKING TESTS
Test all these permission cases (these should have all been tested manually
but need integration tests to ensure they stay correct):
- I can't write to users inboxes who aren't my friends
- I can't write to a users inbox meant for another friend
- I can't see clients of users who aren't my friends
- I can only write to my own clientStates
- I can't read another users list of friends (even if they are my friend)
- I can't read messages sent from one user to another, even for friends
- I can't see who my friends are friends with

TODO: investigate email authentication in Firebase

Need to figure out how many simultaneous connections we can have

How to dynamically refresh friends periodically? (freedom-social-xmpp doesn't do this)

What happens if OAuth tokens expire and we are still connected?

Need to deal with paging for friends list

all demos need to be tested again

Facebook authentication doesn't go to any account choser type of page
and instead may just open and immediately close if they have already logged in
and permission uProxy.  This is ugly, can we either skip opening this tab
(XHR and detect the redirect) or display some success info in this tab?

Our current Firebase app is just a free dev app.  What do we need to do to make
this official / stable / etc?

What happens if too many users try to connect to Firebase?  Can we make login
fail, or have the user logged out automatically rather than just failing
silently?

Get other clients belonging to myself

*/

console.log('initializing firebase, WebSocket is ', WebSocket);
Firebase.INTERNAL.forceWebSockets();

  // TODO: how is it that myInboxForFriendRef also has facebook authentication
  // credentials?  Why don't I need to auth it again?


/*
 * Abstract base class for Firebase social providers.  Classes which inherit
 * from FirebaseSocialProvider must implement following:
 * - set .name property to be the name of the social network, as recognized
 *   by Firebase (e.g. "facebook", not "Facebook").
 * - a getOAuthToken_ method which returns a Promise that fulfills with
 *   an OAuth token for that network
 * - a loadUsers_ method, which should load user profiles and invoke
 *   .addUserProfile_ and .updateUserProfile_ as needed.
 * - a .getMyUserProfile_ method, which returns the logged in user's profile.
 */
var FirebaseSocialProvider = function() {};

FirebaseSocialProvider.prototype.login = function(loginOpts) {
  console.log('login called, ', loginOpts);
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
      console.log('got oauth token: ' + token);
      baseRef.authWithOAuthToken(this.networkName_, token,
          function(error, authData) {
        if (error) {
          this.initState_();
          rejectLogin("Login Failed! " + error);
          return;
        }
        console.log('got authData, ', authData);

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

        this.loadUsers_();
      }.bind(this));  // end of authWithOAuthToken
    }.bind(this));  // end of getOAuthToken_
  }.bind(this));  // end of return new Promise
};

FirebaseSocialProvider.prototype.getClients = function() {
  if (!this.loginState_) {
    return Promise.reject('getClients called when no logged in');
  }
  return Promise.resolve(this.loginState_.clientStates);
};

FirebaseSocialProvider.prototype.getUsers = function() {
  if (!this.loginState_) {
    return Promise.reject('getUsers called when no logged in');
  }
  return Promise.resolve(this.loginState_.userProfiles);
};

FirebaseSocialProvider.prototype.sendMessage = function(toClientId, message) {
  console.log('sendMessage called');
  if (!this.loginState_.clientStates[toClientId]) {
    console.error('Could not find client ' + toClientId);
    return Promise.reject('Could not find client ' + toClientId);
  }

  // TODO: is it possible that someone can write to a friend's inbox, but
  // outside of the client directory?  How to clean this up?

  // TODO: what if there is a permission error on the firebase side?
  // Permission errors can happen if the friend has never actually run uproxy
  // yet (i.e. they don't have their own inbox setup)
  var toUserId = toClientId.substr(0, toClientId.indexOf('/'));
  var toAgent = toClientId.substr(toClientId.indexOf('/'));
  var friendInboxUrl =
      this.baseUrl_ + '/' + this.networkName_ + ':' + toUserId + '/friends/' +
      this.networkName_ + ':' + this.getUserId_() + '/inbox/' + toAgent;
  var friendInboxRef = new Firebase(friendInboxUrl);
  console.log('sending message to url: ' + friendInboxUrl);

  // Send message in the format {fromAgent: message}
  // This format is used so that we can monitor the 'child_added' event
  // and get both the fromClientId and message in the same callback
  var messageObj = {};
  messageObj[this.loginState_.agent] = message;
  friendInboxRef.push(messageObj);
  return Promise.resolve();
};

FirebaseSocialProvider.prototype.logout = function() {
  if (!this.loginState_) {
    // User has already logged out.
    return Promise.resolve();
  }
  this.setPresence_(false);
  // TODO: we should disconnect all Firebase ref's here, so that we free up
  // some of our Firebase quota.  However if we just call Firebase.goOffline(),
  // additional attempts to login with the same webworker (freedom module)
  // fail (authWithOAuthToken never returns).
  this.initState_();
  return Promise.resolve();
};

FirebaseSocialProvider.prototype.initState_ = function() {
  this.baseUrl_ = null;
  this.loginState_ = null;
};

// Friend should contain id and name fields
// TODO: rename friend, maybe change args
FirebaseSocialProvider.prototype.addUserProfile_ = function(friend) {
  if (this.loginState_.userProfiles[friend.userId]) {
    console.warn('addUserProfile called for existing user ', friend);
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
  var myUrlForFriend =
      this.baseUrl_ + '/' + this.networkName_ + ':' + this.getUserId_() +
      '/friends/' + this.networkName_ + ':' + friend.userId;
  var myRefForFriend = new Firebase(myUrlForFriend);
  myRefForFriend.set({isFriend: true});

  // Initialize an inbox, writable only by my friend, and unique to this
  // agent (client).  This should be cleared when I disconnect.
  var myInboxForFriendRef = new Firebase(
      myUrlForFriend + '/inbox/' + this.loginState_.agent);
  myInboxForFriendRef.set('empty');
  myInboxForFriendRef.onDisconnect().remove();

  // Monitor my new inbox.
  myInboxForFriendRef.on('child_added', function(value) {
    value.forEach(function(snapshot) {
      var fromAgent = snapshot.key();
      var message = snapshot.val();
      var clientId = friend.userId + '/' + fromAgent;
      var fromClientState = this.loginState_.clientStates[clientId];
      if (!fromClientState) {
        // We won't have the client yet if the user had never yet signed onto
        // Firebase until after we logged in.  In this case just add a client
        // for them.
        console.log('Got message with unknown client from: ' + friend.userId +
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
  clients.on('value', function(value) {
    // TODO: this is going to be updating the lastUpdated and lastSeen values
    // for each client, any time any of the clients change!!!!
    // i.e. if there are only 2 clients A and B, then C gets added, this will be
    // invoked with A, B, and C..  Find a way to only pay attention to C!!!!
    // TODO: use some combination of child_added and child_changed instead of value
    value.forEach(function(snapshot) {
      var clientId = friend.userId + '/' + snapshot.key();
      var status = snapshot.val() == 'ONLINE' ? 'ONLINE' : 'OFFLINE';
      this.addOrUpdateClient_(friend.userId, clientId, status);
    }.bind(this));
  }.bind(this));
};

// Returns ClientState object.
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

FirebaseSocialProvider.prototype.updateUserProfile_ = function(newUserProfile) {
  if (!newUserProfile.userId) {
    console.error('id missing in updateUserProfile_', newUserProfile);
    return;
  } else if (!this.loginState_.userProfiles[newUserProfile.userId]) {
    console.error('User profile not found for ' + newUserProfile.userId);
    return;
  }
  var profile = this.loginState_.userProfiles[newUserProfile.userId];
  profile.name = newUserProfile.name || profile.name;
  profile.url = newUserProfile.url || profile.url;
  profile.imageData = newUserProfile.imageData || profile.imageData;
  profile.lastUpdated = Date.now();
  this.dispatchEvent_('onUserProfile', profile);
};

FirebaseSocialProvider.prototype.setPresence_ = function(isOnline) {
  // TODO: how can I dyanmically reconnect everything on a quick
  // disconnect??????
  // Should I just logout then login again hidden to the user (re-using same
  // oauth token)?
  var clientRef = new Firebase(
      this.getClientsUrl_(this.getUserId_(), this.loginState_.agent));
  clientRef.set(isOnline ? 'ONLINE' : 'OFFLINE');
  clientRef.onDisconnect().remove();
};

FirebaseSocialProvider.prototype.getClientsUrl_ = function(userId, optAgent) {
  return this.baseUrl_ + '/' + this.networkName_ + ':' + userId + '/clients' +
      (optAgent ? '/' + optAgent : '');
};

// UserId should not include "facebook:", "google:", etc.
FirebaseSocialProvider.prototype.getUserId_ = function() {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.getUserId_: not logged in';
  }
  return this.loginState_.authData[this.networkName_].id;
};
