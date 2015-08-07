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
 * Loads contacts of the logged in user, and calls this.addUserProfile_
 * and this.updateUserProfile_ (if needed later, e.g. for async image
 * fetching) for each contact.
 */
EmailSocialProvider.prototype.loadContacts_ = function() {
  var allFriendsRef = new Firebase(
    this.allUsersUrl_ + '/simplelogin:' + this.getUserId_() + '/friends/');
  // TODO: is on correct or should it be once?
  this.on_(allFriendsRef, 'child_added', function(snapshot) {
    var friendId = snapshot.key().substr('simplelogin:'.length);
    console.log('got friendId ' + friendId);
    var friendProfileUrl =
      this.allUsersUrl_ + '/simplelogin:' + friendId + '/profile/';
    this.readOnce_(friendProfileUrl).then(function(snapshot) {
      if (this.loginState_.userProfiles[friendId]) {
        // TODO: kinda hacky.. This ignores newly added profiles as a result of
        // processing friendRequests
        return;
      }
      console.log('adding pre-existing profile, ' + friendId + ', ' + snapshot.val().name);
      this.addUserProfile_({userId: friendId, name: snapshot.val().name});
    }.bind(this));
  }.bind(this));

  // Monitor friend requests.
  // TODO: these should all be permissioned already, but should we double check?
  var friendRequestsRef = new Firebase(
    this.allUsersUrl_ + '/simplelogin:' + this.getUserId_() + '/friendRequests/');
  // TODO: is on correct or should it be once?
  this.on_(friendRequestsRef, 'child_added', function(snapshot) {

    console.log('got friendRequest ' + snapshot.key() + ', ', snapshot.val());
    console.log('... ' + snapshot.child(snapshot.key()).val());
    snapshot.forEach(function(childSnapshot) {
      var val = childSnapshot.val();
      var friendId = val.userId;
      if (this.loginState_.userProfiles[friendId]) {
        // Sanity check that friend doesn't already exist.
        return;
      }
      this.addUserProfile_({userId: friendId, name: val.name});
      // TODO: delete snapshot!
    }.bind(this));
  }.bind(this));
};

// TODO: use this more
// Returns a promise with the snapshot
EmailSocialProvider.prototype.readOnce_ = function(url) {
  return new Promise(function(F, R) {
    var ref = new Firebase(url);
    ref.once('value', function(snapshot) {
      F(snapshot);
    }.bind(this), function(error) {
      console.error('Failed to read ' + url, error);
      R(error);
    }.bind(this));
  }.bind(this));
};

EmailSocialProvider.prototype.setOnce_ = function(url, data) {
  return new Promise(function(F, R) {
    var ref = new Firebase(url);
    ref.set(data, function(error) {
      if (error) {
        console.error('error setting url ' + url, error);
        R(error);
      } else {
        F();
      }
    }.bind(this));
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
    this.addRequestedUserProfile_({
      userId: friendUserId.substr('simplelogin:'.length),
      name: friendUserName
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
  //   var userMappingRef = new Firebase(userMappingUrl);
  //   userMappingRef.once('value', function(snapshot) {
  //     F(snapshot.val());
  //   }.bind(this), function(error) {
  //     console.log('error in userMappingRef.once value');
  //     R('error');  // TODO:
  //   }.bind(this));
  // }.bind(this));
};

EmailSocialProvider.prototype.acceptUserInvitation = function(userId) {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.acceptUserInvitation: not logged in';
  }
  return new Promise(function(F, R) {
    // // TODO: try/catch
    // var data = JSON.parse(atob(encodedToken));
    // console.log('data ', data);

    // // Try to write to friends friendRequest folder
    // var myUserId = this.getUserId_();
    // var myName = this.name;
    // var friendUserId = data.userId;
    // var friendName = data.name;
    // var token = data.token;

    // // Sanity check
    // if (friendUserId === myUserId) {
    //   return R('friendId matches self'); // TODO: better error
    // }

    // var receivedInviteTokensRef = new Firebase(
    //   this.allUsersUrl_ + '/simplelogin:' + myUserId + '/receivedInviteTokens/' + token);
    // receivedInviteTokensRef.set({received: true}, function(error) {
    //   console.log('pushed');
    //   if (error) {
    //     console.error('error writing to receivedInviteTokens');  // should never happen
    //     return R('error writing to receivedInviteTokens');
    //   }

    //   var friendRequestUrl = this.allUsersUrl_ + '/simplelogin:' + friendUserId + '/friendRequests/' + token;
    //   console.log('friendRequestUrl: ' + friendRequestUrl);
    //   var friendRequestRef = new Firebase(friendRequestUrl);
    //   friendRequestRef.push({userId: myUserId, name: myName}, function(error) {
    //     console.log('push to friendRequestRef completed with error ' + error);
    //     if (error) {
    //       return R('Not permissioned to add friend');
    //     }
    //     F();
    //     this.addUserProfile_({userId: friendUserId, name: friendName});
    //   }.bind(this));
    // }.bind(this));
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
