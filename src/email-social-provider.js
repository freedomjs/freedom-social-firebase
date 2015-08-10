EmailSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  // 'simplelogin' is the name recognized by Firebase, not 'email'
  this.networkName_ = 'simplelogin';
  this.initLogger_('EmailSocialProvider');
  this.initState_();
};
EmailSocialProvider.prototype = new FirebaseSocialProvider();

EmailSocialProvider.prototype.authenticate_ = function(firebaseRef, userName, password) {
  // TODO: use new createAccount paramter!!!!

  var email = this.getEmailFromName_(userName);

  var setProfile = function(authData) {
    this.name = userName;  // TODO: this is hacky, move elsewhere and cleanup all use of this.name

    // TODO: using this.allUsersUrl_ from parent class is hacky...
    var profileUrl = this.allUsersUrl_ + '/' + authData.uid + '/profile';
    console.log('profileUrl ' + profileUrl);
    var profileRef = new Firebase(profileUrl);
    // Note this is the name that appears in the UserProfile, it may contain
    // spaces, etc.
    profileRef.update({name: userName});

    // TODO: ensureu that only logged in user can update this (update rules)
    // TODO: This will require changes for Firebase to expose the email to auth rules
    var userMappingRef = new Firebase(
        this.baseUrl_ + 'simplelogin-user-mapping/' + this.formatEmailForRef_(email));
    userMappingRef.set(authData.uid, function(error) {
      console.log('userMappingRef.update resulted in ' + error);
    });
  }.bind(this);

  return new Promise(function(fulfillAuth, rejectAuth) {

    firebaseRef.createUser({
      email: email,
      password: password
    }, function(error, userData) {
      var auth = function() {
        console.log('calling auth!');
        firebaseRef.authWithPassword({
          email: email,
          password: password
        }, function(error, authData) {
          if (error) {
            rejectAuth(new Error('Login Failed, ' + error));
          } else {
            console.log("Authenticated successfully with payload:", authData);
            setProfile(authData);
            fulfillAuth(authData);
          }
        }.bind(this));
      }.bind(this);

      if (error) {
        switch (error.code) {
          case "EMAIL_TAKEN":
            console.log("The new user account cannot be created because the email is already in use.");
            auth();
            return;

          case "INVALID_EMAIL":
            console.log("The specified email is not a valid email.");
            rejectAuth("The specified email is not a valid email.");
            return;

          default:
            console.log("Error creating user:", error);
            rejectAuth("Error creating user " + error);
        }
      } else {
        console.log("Successfully created user account", userData);
        auth();
      }
    });
  }.bind(this));

};

/*
 * Loads contacts of the logged in user, and calls this.addFriendUserProfile_
 * and this.updateUserProfile_ (if needed later, e.g. for async image
 * fetching) for each contact.
 */
EmailSocialProvider.prototype.loadContacts_ = function() {
  // Load all established (not invited) friends
  var allFriendsRef = new Firebase(
    this.allUsersUrl_ + '/simplelogin:' + this.getUserId_() + '/friends/');
  this.on_(allFriendsRef, 'child_added', function(snapshot) {
    var friendUserId = snapshot.key().substr('simplelogin:'.length);
    var state = snapshot.val().state;
    var name = snapshot.val().name;
    if (state == 'FRIEND') {
      this.addFriendUserProfile_({userId: friendUserId, name: name});
    } else if (state == 'INVITE_SENT') {
      // TODO: weird that we have to include INVITE_SENT
      // TODO: we are no longer using the /friend/profile folder..  can that be removed from JSON rules?
      this.addInviteSentUserProfile_({userId: friendUserId, name: name, state: 'INVITE_SENT'});
    }
  }.bind(this));

  // Monitor friend requests.
  var friendRequestsRef = new Firebase(
    this.allUsersUrl_ + '/simplelogin:' + this.getUserId_() + '/receivedFriendRequests/');
  this.on_(friendRequestsRef, 'child_added', function(snapshot) {
    var friendUserId = snapshot.key().substr('simplelogin:'.length);
    var name = snapshot.val();
    this.addInviteReceivedUserProfile_({userId: friendUserId, name: name, state: 'INVITE_RECEIVED'});
  }.bind(this));

  // Monitor accepted friend requests.
  var friendRequestsRef = new Firebase(
    this.allUsersUrl_ + '/simplelogin:' + this.getUserId_() + '/acceptedFriendRequests/');
  this.on_(friendRequestsRef, 'child_added', function(snapshot) {
    var friendUserId = snapshot.key().substr('simplelogin:'.length);
    var name = snapshot.val();
    this.addFriendUserProfile_({userId: friendUserId, name: name});
  }.bind(this));
};

/*
 * Returns UserProfile object for the logged in user.
 */
EmailSocialProvider.prototype.getMyUserProfile_ = function() {
  if (!this.loginState_) {
    throw 'Error in EmailSocialProvider.getMyUserProfile_: not logged in';
  }
  return {
    userId: this.getUserId_(),
    name: this.name,
    lastUpdated: Date.now(),
    url: '',
    imageData: ''
  };
};

// TODO: is this really needed?  Can I remove it?
EmailSocialProvider.prototype.getUserId_ = function() {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.getUserId_: not logged in';
  }
  //return 'dborkanATgmail';  // TODO: remove
  //return this.loginState_.authData.password.email;
  var uid = this.loginState_.authData.uid;
  return uid.substr(uid.indexOf(':') + 1);
};

// TODO: the API isn't really accurate here, it says userId but it's really
// user name (e.g. "daniel" rather than simplelogin:<number>)
// TODO: we should figure out what we want the userId exposed to uproxy to be?
// maybe it should be the readable name and simplelogin:x just used internal to
// this class?
EmailSocialProvider.prototype.inviteUser = function(friendUserName) {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.inviteUser: not logged in';
  }

  // TODO: all this stuff where some ids have simplelogin: prepended and some
  // don't are nuts!
  return this.getIdFromName_(friendUserName).then(function(friendUserId) {
    console.log('getIdFromName_: ' + friendUserName + ' -> ' + friendUserId);
    // Write to friend's receivedFriendRequests folder
    this.setOnce_(
      this.allUsersUrl_ + '/' + friendUserId + '/receivedFriendRequests/simplelogin:' + this.getUserId_(),
      this.name);
    // TODO: wait for first write to finish?
    // Write to our own sentFriendRequests folder
    this.setOnce_(
      this.allUsersUrl_ + '/simplelogin:' + this.getUserId_() + '/sentFriendRequests/' + friendUserId,
      friendUserName);
    this.addInviteSentUserProfile_({
      userId: friendUserId.substr('simplelogin:'.length),
      name: friendUserName,
      state: 'INVITE_SENT'
    });
  }.bind(this));
};

EmailSocialProvider.prototype.getEmailFromName_ = function(userName) {
  var email = 'firebase+' + userName + '@uproxy.org';
  // Remove any whitespace characters.
  // TODO: are there other characters we should check for?
  // TODO: make lowercase?
  email = email.replace(/\s+/g, '');
  return email;
};

EmailSocialProvider.prototype.formatEmailForRef_ = function(email) {
  // Firebase URLs can't have . # $ [ or ]
  // TODO: full regex
  var formattedEmail = email.replace(/\./g, '');
  // TODO: for some reason + turns into space, so replace it with a - instead
  formattedEmail = formattedEmail.replace(/\+/g, '-');
  return formattedEmail;
};

// TODO: need to be clear which ids contain "simplelogin:"... currently this one does
EmailSocialProvider.prototype.getIdFromName_ = function(userName) {
  var email = this.getEmailFromName_(userName);
  var userMappingUrl = this.baseUrl_ + 'simplelogin-user-mapping/' + this.formatEmailForRef_(email);
  return this.readOnce_(userMappingUrl).then(function(snapshot) {
    return snapshot.val();
  }.bind(this));
};

EmailSocialProvider.prototype.acceptUserInvitation = function(friendUserId) {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.acceptUserInvitation: not logged in';
  }
  var friendData = this.loginState_.userProfiles[friendUserId];
  if (!this.loginState_) {
    throw 'Friend not found, ' + friendUserId;
  }
  var friendUserName = friendData.name;
  return new Promise(function(F, R) {
    // TODO: none of this is tested!
    this.setOnce_(
          this.allUsersUrl_ + '/simplelogin:' + friendUserId + '/acceptedFriendRequests/simplelogin:' + this.getUserId_(),
          this.name);
    this.addFriendUserProfile_({userId: friendUserId, name: friendUserName});
  }.bind(this));
};


// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(EmailSocialProvider);
  } else {
    freedom.social().providePromises(EmailSocialProvider);
  }
}
