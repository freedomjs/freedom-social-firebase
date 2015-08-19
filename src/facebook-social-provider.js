FacebookSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'facebook';
  this.initLogger_('FacebookSocialProvider');
  this.initState_();
};
FacebookSocialProvider.prototype = new FirebaseSocialProvider();

FacebookSocialProvider.prototype.authenticate_ = function(firebaseRef, loginOpts) {
  return this.oauth_(firebaseRef, loginOpts).then(function(authData) {
    this.name = authData.facebook.displayName;  // TODO: test this

    // TODO: using this.allUsersUrl_ from parent class is hacky...
    var profileUrl = this.allUsersUrl_ + '/' + authData.uid + '/profile';
    console.log('profileUrl ' + profileUrl);
    var profileRef = new Firebase(profileUrl);
    // Note this is the name that appears in the UserProfile, it may contain
    // spaces, etc.
    profileRef.update({name: this.name});

    return authData;
  }.bind(this));
};

/*
 * Returns a Promise which fulfills with an OAuth token.
 */
FacebookSocialProvider.prototype.getOAuthToken_ = function(loginOpts) {
  if (loginOpts.interactive) {
    return this.getOAuthTokenInteractive_(loginOpts);
  }

  // For non-interactive logins, attempt to re-use the last accessToken if it
  // is still valid.  If not default to interactive login behavior.
  return this.storage.get('FacebookSocialProvider-last-access-token').then(
      function(lastAccessToken) {
    return this.isValidOAuthToken_(lastAccessToken).then(function(isValid) {
      if (isValid) {
        return lastAccessToken;
      } else {
        return this.getOAuthTokenInteractive_(loginOpts);
      }
    }.bind(this));
  }.bind(this));
};

/*
 * Launches an interactive Facebook OAuth login.
 * Returns a Promise which fulfills with an OAuth token.
 */
FacebookSocialProvider.prototype.getOAuthTokenInteractive_ =
    function(loginOpts) {
  var OAUTH_REDIRECT_URLS = [
    "https://www.uproxy.org/oauth-redirect-uri",
    "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/",
    "http://freedomjs.org/",
    'http://localhost:8080/'
  ];
  var OAUTH_CLIENT_ID = '161927677344933';
  var OAUTH_SCOPE = 'user_friends';

  var oauth = freedom["core.oauth"]();
  return oauth.initiateOAuth(OAUTH_REDIRECT_URLS).then(function(stateObj) {
    var url = "https://www.facebook.com/dialog/oauth?" +
                "client_id=" + encodeURIComponent(OAUTH_CLIENT_ID) +
                "&scope=" + encodeURIComponent(OAUTH_SCOPE) +
                "&redirect_uri=" + encodeURIComponent(stateObj.redirect) +
                "&state=" + encodeURIComponent(stateObj.state) +
                "&response_type=token";
    return oauth.launchAuthFlow(url, stateObj, loginOpts.interactive);
  }).then(function(responseUrl) {
    var accessToken = responseUrl.match(/access_token=([^&]+)/)[1];
    if (loginOpts.rememberLogin) {
      this.storage.set('FacebookSocialProvider-last-access-token', accessToken);
    }
    return accessToken;
  }.bind(this)).catch(function (err) {
    return Promise.reject('Login error: ' + err);
  });
};

/*
 * Loads contacts of the logged in user, and calls this.addUserProfile_
 * and this.updateUserProfile_ (if needed later, e.g. for async image
 * fetching) for each contact.
 */
FacebookSocialProvider.prototype.loadContacts_ = function() {
  // TODO: this is almost identical to Email
  // (just changed facebook: to facebook:)...
  // should combine if we really go forward with this stuff.

  var allFriendsRef = new Firebase(
    this.allUsersUrl_ + '/facebook:' + this.getUserId_() + '/friends/');
  // TODO: is on correct or should it be once?
  this.on_(allFriendsRef, 'child_added', function(snapshot) {
    var friendId = snapshot.key().substr('facebook:'.length);
    console.log('got friendId ' + friendId);
    var friendProfileRef = new Firebase(
      this.allUsersUrl_ + '/facebook:' + friendId + '/profile/');
    friendProfileRef.once('value', function(snapshot) {
      if (!snapshot.exists()) {
        console.error('Profile not found for friend ' + friendId);
        return;
      } else if (this.loginState_.userProfiles[friendId]) {
        // TODO: kinda hacky.. This ignores newly added profiles as a result of
        // processing friendRequests
        return;
      }
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
    this.allUsersUrl_ + '/facebook:' + this.getUserId_() + '/friendRequestsWithToken/');
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
FacebookSocialProvider.prototype.getMyUserProfile_ = function() {
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
    imageData: cachedUserProfile.picture.data.url
  };
};

/*
 * Makes get request to Facebook endpoint, and returns a Promise which
 * fulfills with the response object.
 */
FacebookSocialProvider.prototype.facebookGet_ = function(endPoint) {
  if (!this.loginState_) {
    throw 'Not signed in';
  }
  var xhr = new XMLHttpRequest();
  var url = 'https://graph.facebook.com/v2.1/' + endPoint +
      '?access_token=' + this.loginState_.authData.facebook.accessToken +
      '&format=json&redirect=false';
  xhr.open('GET', url);
  return new Promise(function(fulfill, reject) {
    // TODO: error checking
    xhr.onload = function() {
      fulfill(JSON.parse(this.response));
    };
    xhr.send();
  });
};

// TODO: same as Email (just changed simplelogin: to facebook:)
FacebookSocialProvider.prototype.getInviteToken = function() {
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

// TODO: same as Email (just changed simplelogin: to facebook:)
FacebookSocialProvider.prototype.addContact = function(encodedToken) {
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
      this.allUsersUrl_ + '/facebook:' + myUserId + '/receivedInviteTokens/' + token);
    receivedInviteTokensRef.set({received: true}, function(error) {
      console.log('pushed');
      if (error) {
        console.error('error writing to receivedInviteTokens');  // should never happen
        return R('error writing to receivedInviteTokens');
      }

      var friendRequestUrl = this.allUsersUrl_ + '/facebook:' + friendUserId + '/friendRequestsWithToken/' + token;
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

FacebookSocialProvider.prototype.sendEmail = function(friendEmail, subject, body) {
  return Promise.reject('Not implemented');
};

/*
 * Returns a Promise<boolean> that fulfills with true iff token is still valid.
 */
FacebookSocialProvider.prototype.isValidOAuthToken_ = function(token) {
  return new Promise(function(fulfill, reject) {
    if (!token) {
      fulfill(false);
      return;
    }
    var xhr = new XMLHttpRequest();
    var url = 'https://graph.facebook.com/v2.1/me?access_token=' + token +
        '&format=json&redirect=false';
    xhr.open('GET', url);
    xhr.onload = function() {
      if (JSON.parse(this.response).error) {
        fulfill(false);
      } else {
        fulfill(true);
      }
    };
    xhr.send();
  });
};

// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(FacebookSocialProvider);
  } else {
    freedom.social().providePromises(FacebookSocialProvider);
  }
}
