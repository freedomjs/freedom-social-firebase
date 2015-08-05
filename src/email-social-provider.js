EmailSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  // 'simplelogin' is the name recognized by Firebase, not 'email'
  this.networkName_ = 'simplelogin';
  this.initLogger_('EmailSocialProvider');
  this.initState_();
};
EmailSocialProvider.prototype = new FirebaseSocialProvider();

EmailSocialProvider.prototype.authenticate_ = function(firebaseRef, userName, password) {
  var setProfile = function(authData) {
    this.name = userName;  // TODO: this is hacky, move elsewhere and cleanup all use of this.name

    // TODO: using this.allUsersUrl_ from parent class is hacky...
    var profileUrl = this.allUsersUrl_ + '/' + authData.uid + '/profile';
    console.log('profileUrl ' + profileUrl);
    var profileRef = new Firebase(profileUrl);
    // Note this is the name that appears in the UserProfile, it may contain
    // spaces, etc.
    profileRef.update({name: userName});
  }.bind(this);

  return new Promise(function(fulfillAuth, rejectAuth) {
    var email = 'firebase.' + userName + '@uproxy.org';
    // Remove any whitespace characters.
    // TODO: are there other characters we should check for?
    email = email.replace(/\s+/g, '');

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

    // TODO: there are race conditions where if child_added for all friends is done, then
    // child_added for friendRequests, then value for all friends....  blah blah blah
    // you hit the duplicate..  Maybe just get rid of warning trace!
    if (this.loginState_.userProfiles[friendId]) {
      // TODO: kinda hacky.. This ignores newly added profiles as a result of
      // processing friendRequests
      return;
    }

    var friendProfileRef = new Firebase(
      this.allUsersUrl_ + '/simplelogin:' + friendId + '/profile/');
    friendProfileRef.once('value', function(snapshot) {
      console.log('adding pre-existing profile, ' + friendId + ', ' + snapshot.val().name);
      this.addUserProfile_({userId: friendId, name: snapshot.val().name});
    }.bind(this), function(error) {
      // TODO: if the friend didn't actually add us (accept our friendRequest)
      // this will fail to read due to permissions..  Not actually an error
      console.log('error is !!!! ', error);
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

EmailSocialProvider.prototype.getUserId_ = function() {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.getUserId_: not logged in';
  }
  //return 'dborkanATgmail';  // TODO: remove
  //return this.loginState_.authData.password.email;
  var uid = this.loginState_.authData.uid;
  return uid.substr(uid.indexOf(':') + 1);
};

EmailSocialProvider.prototype.getIntroductionToken = function() {
  if (!this.loginState_) {
    throw 'Error in FirebaseSocialProvider.getUserId_: not logged in';
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
  return Promise.resolve(btoa(jsonString));
};

EmailSocialProvider.prototype.addContact = function(encodedToken) {
  return new Promise(function(F, R) {
    console.log('addContact called with ' + encodedToken);
    // TODO: try/catch
    var data = JSON.parse(atob(encodedToken));
    console.log('data ', data);

    // Try to write to friends friendRequest folder
    var myUserId = this.getUserId_();
    var myName = this.name;
    var friendUserId = data.userId;
    var friendName = data.name;
    var token = data.token;

    // Sanity check
    if (friendUserId === myUserId) {
      return R('friendId matches self'); // TODO: better error
    }

    var receivedInviteTokensRef = new Firebase(
      this.allUsersUrl_ + '/simplelogin:' + myUserId + '/receivedInviteTokens/' + token);
    receivedInviteTokensRef.set({received: true}, function(error) {
      console.log('pushed');
      if (error) {
        console.error('error writing to receivedInviteTokens');  // should never happen
        return R('error writing to receivedInviteTokens');
      }

      var friendRequestUrl = this.allUsersUrl_ + '/simplelogin:' + friendUserId + '/friendRequests/' + token;
      console.log('friendRequestUrl: ' + friendRequestUrl);
      var friendRequestRef = new Firebase(friendRequestUrl);
      friendRequestRef.push({userId: myUserId, name: myName}, function(error) {
        console.log('push to friendRequestRef completed with error ' + error);
        if (error) {
          return R('Not permissioned to add friend');
        }
        F();
        this.addUserProfile_({userId: friendUserId, name: friendName});
      }.bind(this));
    }.bind(this));
  }.bind(this));
};


// Register provider when in a module context.
console.log('registering email provider: A');
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    console.log('registering email provider: B');
    freedom().providePromises(EmailSocialProvider);
  } else {
    console.log('registering email provider: C');
    freedom.social().providePromises(EmailSocialProvider);
  }
}
