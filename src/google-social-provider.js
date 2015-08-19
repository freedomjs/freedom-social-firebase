GoogleSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'google';
  this.initLogger_('GoogleSocialProvider');
  this.initState_();
};
GoogleSocialProvider.prototype = new FirebaseSocialProvider();

GoogleSocialProvider.prototype.authenticate_ = function(firebaseRef, loginOpts) {
  return this.oauth_(firebaseRef, loginOpts).then(function(authData) {
    console.log('authData', authData);
    // TODO: displayName isn't always available.
    // TODO: if both displayName and email aren't available we should
    // probably reject?
    this.name = authData.google.displayName || authData.google.email;
    this.email = authData.google.email;

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
GoogleSocialProvider.prototype.getOAuthToken_ = function(loginOpts) {
  var OAUTH_REDIRECT_URLS = [
    "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/",
    "https://www.uproxy.org/oauth-redirect-uri",
    "http://freedomjs.org/",
    'http://localhost:8080/'
  ];
  var OAUTH_CLIENT_ID = '746567772449-jkm5q5hjqtpq5m9htg9kn0os8qphra4d' +
      '.apps.googleusercontent.com';
  var OAUTH_SCOPE = 'https://www.googleapis.com/auth/plus.me%20' +
      'https://www.googleapis.com/auth/userinfo.email%20' +
      'https://www.googleapis.com/auth/gmail.send';

  var oauth = freedom["core.oauth"]();
  return oauth.initiateOAuth(OAUTH_REDIRECT_URLS).then(function(stateObj) {
    var oauthUrl = "https://accounts.google.com/o/oauth2/auth?" +
        "client_id=" + OAUTH_CLIENT_ID +
        "&scope=" + OAUTH_SCOPE +
        "&redirect_uri=" + encodeURIComponent(stateObj.redirect) +
        "&state=" + encodeURIComponent(stateObj.state) +
        "&response_type=token";
    var url = 'https://accounts.google.com/accountchooser?continue=' +
        encodeURIComponent(oauthUrl);
    return oauth.launchAuthFlow(url, stateObj);
  }).then(function(responseUrl) {
    return responseUrl.match(/access_token=([^&]+)/)[1];
  }).catch(function (err) {
    return Promise.reject('Login error: ' + err.message);
  });
};

/*
 * Loads contacts of the logged in user, and calls this.addUserProfile_
 * and this.updateUserProfile_ (if needed later, e.g. for async image
 * fetching) for each contact.
 */
GoogleSocialProvider.prototype.loadContacts_ = function() {
  // TODO: this is almost identical to Email
  // (just changed google: to google:)...
  // should combine if we really go forward with this stuff.

  var allFriendsRef = new Firebase(
    this.allUsersUrl_ + '/google:' + this.getUserId_() + '/friends/');
  // TODO: is on correct or should it be once?
  this.on_(allFriendsRef, 'child_added', function(snapshot) {
    var friendId = snapshot.key().substr('google:'.length);
    console.log('got friendId ' + friendId);
    var friendProfileRef = new Firebase(
      this.allUsersUrl_ + '/google:' + friendId + '/profile/');
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
    this.allUsersUrl_ + '/google:' + this.getUserId_() + '/friendRequestsWithToken/');
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
GoogleSocialProvider.prototype.getMyUserProfile_ = function() {
  if (!this.loginState_) {
    throw 'Error in GoogleSocialProvider.getMyUserProfile_: not logged in';
  }
  var cachedUserProfile =
      this.loginState_.authData[this.networkName_].cachedUserProfile;
  return {
    userId: this.getUserId_(),
    name: cachedUserProfile.name,
    lastUpdated: Date.now(),
    url: cachedUserProfile.link,
    imageData: cachedUserProfile.picture + '?sz=50'
  };
};

/*
 * Makes get request to Google endpoint, and returns a Promise which
 * fulfills with the response object.
 */
GoogleSocialProvider.prototype.googleGet_ = function(endPoint) {
  if (!this.loginState_) {
    throw 'Not signed in';
  }
  var xhr = new XMLHttpRequest();
  var url = 'https://www.googleapis.com/' + endPoint +
      '?key=AIzaSyA1Q7SiEeUdSJwansl2AUFXLpVdnsXUzYg';
  xhr.open('GET', url);
  xhr.setRequestHeader(
      'Authorization',
      'Bearer ' + this.loginState_.authData.google.accessToken);
  return new Promise(function(fulfill, reject) {
    // TODO: error checking
    xhr.onload = function() {
      fulfill(JSON.parse(this.response));
    };
    xhr.send();
  });
};

/*
 * Makes get request to Google endpoint, and returns a Promise which
 * fulfills with the response object.
 */
GoogleSocialProvider.prototype.googlePost_ = function(endPoint, data) {
  if (!this.loginState_) {
    throw 'Not signed in';
  }
  var xhr = new XMLHttpRequest();
  var url = 'https://www.googleapis.com/' + endPoint +
      '?key=AIzaSyA1Q7SiEeUdSJwansl2AUFXLpVdnsXUzYg&alt=json';
  xhr.open('POST', url);
  xhr.setRequestHeader(
      'Authorization',
      'Bearer ' + this.loginState_.authData.google.accessToken);
  xhr.setRequestHeader(
      'Content-Type', 'application/json');
  return new Promise(function(fulfill, reject) {
    // TODO: error checking
    xhr.onload = function() {
      fulfill(JSON.parse(this.response));
    };
    xhr.send(data);
  });
};

GoogleSocialProvider.prototype.sendEmail = function(friendEmail, subject, body) {
  var email ='"Content-Type: text/plain; charset="us-ascii"\n' +
      'MIME-Version: 1.0\n' +
      'Content-Transfer-Encoding: 7bit\n' +
      'to: ' + friendEmail + '\n' +
      'from: ' + this.email + '\n' +
      'subject: ' + subject + '\n\n' + body;
  this.googlePost_('gmail/v1/users/me/messages/send',
      JSON.stringify({raw: btoa(email)}));
};

// TODO: same as Email (just changed simplelogin: to google:)
GoogleSocialProvider.prototype.getInviteToken = function() {
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

// TODO: same as Email (just changed simplelogin: to google:)
GoogleSocialProvider.prototype.addContact = function(encodedToken) {
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
      this.allUsersUrl_ + '/google:' + myUserId + '/receivedInviteTokens/' + token);
    receivedInviteTokensRef.set({received: true}, function(error) {
      console.log('pushed');
      if (error) {
        console.error('error writing to receivedInviteTokens');  // should never happen
        return R('error writing to receivedInviteTokens');
      }

      var friendRequestUrl = this.allUsersUrl_ + '/google:' + friendUserId + '/friendRequestsWithToken/' + token;
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
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(GoogleSocialProvider);
  } else {
    freedom.social().providePromises(GoogleSocialProvider);
  }
}

