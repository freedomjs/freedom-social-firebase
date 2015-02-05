/*
KNOWN ISSUES:

not in a freedom module

messages aren't deleted after being read

single point of failure

scalability: currently only support ~40 simultaneous connections, not
sure how much we can scale

doesn't use a real core.oauth provider

need to remove directories/access for users who are no longer friends

brand new users can't detect each other properly (not sure why)
  if alice and bob are friends, but neither has signed in yet, then alice signs
  in for the first time, then bob signs in for the first time, bob will see that
  alice has an online client, but alice will not see bob's online client (probably
  she is not monitoring bob's list of clients)....  Only when she signs on again
  will she see bob and be able to communicate with him
  This happens with both Google and Facebook
  TBD: it seems like we can't monitor 'value' on a firebase ref that doesn't
  yet exist...  If this is the case, maybe new users (users whose directory we
  just created) need to send 'I'm here' messages to all their friends who are
  already on firebase

lacks tests

if a user signs in with the same instance name twice things break
we should probably either reject the new sign in attempt, or we should
force sign out the old instance

need to have automatic reconnects in case of failure.

Test all these permission cases:
- I can't write to users inboxes who aren't my friends
- I can't write to a users inbox meant for another friend
- I can't see clients of users who aren't my friends
- I can only write to my own clientStates
- I can't read another users list of friends (even if they are my friend)

Need to figure out how many simultaneous connections we can have

Is it bad to repeatedly create new Firebase objects?  Should we re-use
the same one over and over using .child(..) to get at the different nodes?

How to dynamically refresh friends periodically?

What happens if OAuth tokens expire and we are still connected?

Need to fulfill login promise with my own client state

Do we need to emit my own clientState and userProfile?  Should they be included
in getUserProfiles and getClientStates?

Need to implement logout.

Need to deal with paging for friends list

Need images, urls, etc for profiles
  - G+ has images (urls) immediately available, FB doesn't seem to

baseUrl should be passed in to login args

automatically delete data so its safe from dashboard

Firebase should be pulled from npm / bower / etc

*/

Firebase.INTERNAL.forceWebSockets();

  // TODO: how is it that myInboxForFriendRef also has facebook authentication
  // credentials?  Why don't I need to auth it again?


var FirebaseSocialProvider = function() {
  console.log('FirebaseSocialProvider called');
}

FirebaseSocialProvider.prototype.login = function(loginOpts) {
  if (this.loginState_) {
    return Promise.reject('Already logged in');
  } else if (!loginOpts.agent) {
    return Promise.reject('loginOpts.agent must be set');
  }

  // TODO: need to pass in token using an OAuthView
  return new Promise(function(fulfill, reject) {
    var baseRef = new Firebase(this.baseUrl_);
    // TODO: add real core.oauth logic
    var tokenFromUI = getTokenFromUI();
    var tokenPromise =
        tokenFromUI ? Promise.resolve(tokenFromUI) : this.getOAuthToken();
    tokenPromise.then(function(token) {
      baseRef.authWithOAuthToken(this.networkName_, token,
          function(error, authData) {
        if (error) {
          this.loginState_ = null;
          reject("Login Failed! " + error);
        } else {
          console.log("Authenticated successfully with payload:", authData);
          this.loginState_ = {
            authData: authData,
            userProfiles: {},  // map from userId to userProfile
            clientStates: {},  // map from clientId to clientState
            agent: loginOpts.agent  // Agent string.  Does not include userId.
          };
          this.setPresence_(true);
          this.loadFriends_().then(function(friends) {
            console.log('got friends: ', friends);
            for (var i = 0; i < friends.length; ++i) {
              this.processFriend_(friends[i]);
            }
          }.bind(this)).then(fulfill);  // end of loadFriends
          // TODO: we need to pass some stuff to fulfill!!!!
          // TODO: we need to emit our own user profile and maybe client?
          // TODO: should getUserProfiles and getClientStates return our own info?
        }
      }.bind(this));  // end of authWithOAuthToken
    }.bind(this));  // end of getOAuthToken
  }.bind(this));  // end of return new Promise
};

FirebaseSocialProvider.prototype.getClients = function() {
  if (!this.loginState_) {
    return Promise.reject('Not logged in');
  }
  return Promise.resolve(this.loginState_.clientStates);
}

FirebaseSocialProvider.prototype.getUsers = function() {
  if (!this.loginState_) {
    return Promise.reject('Not logged in');
  }
  return Promise.resolve(this.loginState_.userProfiles);
}

FirebaseSocialProvider.prototype.sendMessage = function(toClientId, message) {
  if (!this.loginState_.clientStates[toClientId]) {
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
}

FirebaseSocialProvider.prototype.logout = function() {
  this.initState_();
  // TODO: are there any firebase calls to make?
  // We need to disconnect all our firebase refs
  return Promise.resolve();
}


FirebaseSocialProvider.prototype.initState_ = function() {
  // TODO: popping-heat-4874 should be passed in.
  this.baseUrl_ = 'https://popping-heat-4874.firebaseio.com/' +
      this.networkName_ + '-users';
  var loginState_ = null;
}

// Friend should contain id and name fields
FirebaseSocialProvider.prototype.processFriend_ = function(friend) {
  // Ensure that a permanent friend object exists, with the users name.
  // This must be present in order for other friends to properly detect our
  // clients, based on the current Firebase rules configuration.
  var myUrlForFriend =
      this.baseUrl_ + '/' + this.networkName_ + ':' + this.getUserId_() +
      '/friends/' + this.networkName_ + ':' + friend.id;
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
      var fromClientState =
          this.loginState_.clientStates[friend.id + '/' + fromAgent];
      if (!fromClientState) {
        console.warn('Got message with unknown client from: ' + friend.id +
            ', key: ' + fromAgent + ', val: ' + message);
        return;
      }
      fromClientState.lastSeen = Date.now();
      this.dispatchEvent_(
          'onMessage', {from: fromClientState, message: message});
    }.bind(this));
  }.bind(this));

  // Create a userProfile right away.
  this.loginState_.userProfiles[friend.id] = {
    userId: friend.id,
    name: friend.name,
    lastUpdated: Date.now(),
    url: '', // TODO:
    imageData: '' // TODO:
  };
  this.dispatchEvent_('onUserProfile', this.loginState_.userProfiles[friend.id]);

  // Get + monitor clients for friend.
  var clients = new Firebase(this.getClientsUrl_(friend.id));
  clients.on('value', function(value) {
    // TODO: this is going to be updating the lastUpdated and lastSeen values
    // for each client, any time any of the clients change!!!!
    // i.e. if there are clients A and B, then C gets added, this will be
    // invoked with A, B, and C..  Find a way to only pay attention to C!!!!
    value.forEach(function(snapshot) {
      var clientId = friend.id + '/' + snapshot.key();
      var status = snapshot.val() == 'ONLINE' ? 'ONLINE' : 'OFFLINE';
      this.loginState_.clientStates[clientId] = {
        userId: friend.id,
        clientId: clientId,
        status: status,
        lastUpdated: Date.now(),
        lastSeen: Date.now()  // TODO: are these dates right?
      };
      this.dispatchEvent_(
          'onClientState', this.loginState_.clientStates[clientId]);
    }.bind(this));
  }.bind(this))
};

FirebaseSocialProvider.prototype.setPresence_ = function(isOnline) {
  // TODO: how can I dyanmically reconnect everything on a quick
  // disconnect??????
  // Should I just logout then login again hidden to the user (re-using same
  // oauth token)?
  var clientRef = new Firebase(
      this.getClientsUrl_(this.getUserId_(), this.loginState_.agent));
  if (isOnline) {
    clientRef.set('ONLINE');
    clientRef.onDisconnect().set('OFFLINE');
  } else {
    clientRef.set('OFFLINE');
  }
};

FirebaseSocialProvider.prototype.getClientsUrl_ = function(userId, optAgent) {
  return this.baseUrl_ + '/' + this.networkName_ + ':' + userId + '/clients' +
      (optAgent ? '/' + optAgent : '');
}

// UserId should not include "facebook:", "google:", etc.
FirebaseSocialProvider.prototype.getUserId_ = function() {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.getUserId_: not logged in';
  }
  return this.loginState_.authData[this.networkName_].id;
}
