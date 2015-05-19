EmailSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  // 'password' is the name recognized by Firebase, not 'email'
  this.networkName_ = 'password';
  this.initLogger_('EmailSocialProvider');
  this.initState_();
};
EmailSocialProvider.prototype = new FirebaseSocialProvider();

EmailSocialProvider.prototype.authenticate_ = function(firebaseRef) {
  firebaseRef.createUser({
    email: "dborkan@gmail.com",
    password: "horseRocket"
  }, function(error, userData) {
    if (error) {
      switch (error.code) {
        case "EMAIL_TAKEN":
          console.log("The new user account cannot be created because the email is already in use.");
          break;
        case "INVALID_EMAIL":
          console.log("The specified email is not a valid email.");
          break;
        default:
          console.log("Error creating user:", error);
      }
    } else {
      console.log("Successfully created user account", userData);
    }
  });
  return Promise.reject('TOOD: remove!');
};

/*
 * Loads contacts of the logged in user, and calls this.addUserProfile_
 * and this.updateUserProfile_ (if needed later, e.g. for async image
 * fetching) for each contact.
 */
EmailSocialProvider.prototype.loadContacts_ = function() {
  this.facebookGet_('me/friends').then(function(resp) {
    var users = resp.data;
    for (var i = 0; i < users.length; ++i) {
      this.addUserProfile_({
        userId: users[i].id,
        name: users[i].name,
        url: 'https://www.facebook.com/' + users[i].id
      });
      this.getUserImage_(users[i].id);
    }
  }.bind(this)).catch(function(e) {
    this.logger.error('loadContacts_ failed', e);
  }.bind(this));
};

/*
 * Returns UserProfile object for the logged in user.
 */
EmailSocialProvider.prototype.getMyUserProfile_ = function() {
  // TODO: does this need to change for email?
  if (!this.loginState_) {
    throw 'Error in EmailSocialProvider.getMyUserProfile_: not logged in';
  }
  var cachedUserProfile =
      this.loginState_.authData[this.networkName_].cachedUserProfile;
  return {
    userId: this.getUserId_(),
    name: cachedUserProfile.name,
    lastUpdated: Date.now(),
    url: cachedUserProfile.link,
    imageData: cachedUserProfile.picture.data.url
  };
};

// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(EmailSocialProvider);
  } else {
    freedom.social().providePromises(EmailSocialProvider);
  }
}
