EmailSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  // 'simplelogin' is the name recognized by Firebase, not 'email'
  this.networkName_ = 'simplelogin';
  this.initLogger_('EmailSocialProvider');
  this.initState_();
};
EmailSocialProvider.prototype = new FirebaseSocialProvider();

EmailSocialProvider.prototype.authenticate_ = function(firebaseRef, userId, password) {
  return new Promise(function(fulfillAuth, rejectAuth) {
    var email = userId + '@uproxy-firebase.com';  // TODO: use a real address?
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
  // TODO: remove this crazy hack!
  if (this.getUserId_() == '1') {
    this.addUserProfile_({userId: '2', name: 'uproxyeva@gmail.com'});
  } else if (this.getUserId_() == '2') {
    this.addUserProfile_({userId: '1', name: 'dborkan@gmail.com'});
  }
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
    name: this.loginState_.authData.password.email,
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


// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(EmailSocialProvider);
  } else {
    freedom.social().providePromises(EmailSocialProvider);
  }
}
