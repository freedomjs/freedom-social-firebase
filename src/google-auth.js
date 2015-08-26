GoogleSocialProvider.prototype.oAuthRedirectUris = [
  "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/",
  "https://www.uproxy.org/oauth-redirect-uri",
  "http://freedomjs.org/",
  'http://localhost:8080/'
];
GoogleSocialProvider.prototype.oAuthClientId = "746567772449-jkm5q5hjqtpq5m9htg9kn0os8qphra4d.apps.googleusercontent.com";
GoogleSocialProvider.prototype.oAuthScope = 'https://www.googleapis.com/auth/plus.me%20' +
      'https://www.googleapis.com/auth/userinfo.email%20' +
      'https://www.googleapis.com/auth/gmail.send';
GoogleSocialProvider.prototype.clientSecret = "h_hfPI4jvs9fgOgPweSBKnMu";

/*
 * Returns a Promise which fulfills with an OAuth token.
 */
GoogleSocialProvider.prototype.getOAuthToken_ = function(loginOpts) {
  if (loginOpts.interactive && !loginOpts.rememberLogin) {
    // Old login logic that gets accessToken and skips refresh tokens
    return this.getAccessTokenWithOAuth_();
  }

  return new Promise(function (F, R) {
    var getCredentialsPromise = loginOpts.interactive ?
        this.getCredentialsInteractive_() : this.getCredentialsFromStorage_();
    getCredentialsPromise.then(function(data) {
      var refreshToken = data.refreshToken;
      var accessToken = data.accessToken;
      var email = data.email;
      if (loginOpts.rememberLogin) {
        this.saveLastRefreshTokenAndEmail_(refreshToken, email);
        this.saveRefreshTokenForEmail_(refreshToken, email);
      }
      F(accessToken);
    }.bind(this)).catch(function(e) {
      this.logger.error('Error getting credentials: ', e);
      R('Error getting credentials: ' + e);
    }.bind(this));
  }.bind(this));
};

GoogleSocialProvider.prototype.getAccessTokenWithOAuth_ = function() {
  return new Promise(function (F, R) {
    this.oauth = freedom["core.oauth"]();
    this.oauth.initiateOAuth(this.oAuthRedirectUris).then(function(stateObj) {
      var oauthUrl = "https://accounts.google.com/o/oauth2/auth?" +
               "client_id=" + this.oAuthClientId +
               "&scope=" + this.oAuthScope +
               "&redirect_uri=" + encodeURIComponent(stateObj.redirect) +
               "&state=" + encodeURIComponent(stateObj.state) +
               "&response_type=token";
      var url = 'https://accounts.google.com/accountchooser?continue=' +
          encodeURIComponent(oauthUrl);
      return this.oauth.launchAuthFlow(url, stateObj);
    }.bind(this)).then(function(responseUrl) {
      var token = responseUrl.match(/access_token=([^&]+)/)[1];
      F(token);
    }.bind(this)).catch(function (err) {
      this.logger.error('Error in getAccessTokenWithOAuth_', err);
      R('Error in getAccessTokenWithOAuth_' + err);
    }.bind(this));
  }.bind(this));
};

/**
  Returns Promise<{refreshToken, accessToken, email}>
  Open Google account chooser to let the user pick an account, then request a
  refresh token.  Possible outcomes:
  1. Google gives us a refresh token after closing the oauth window, all good
  2. Google does not give us a refresh token after closing the oauth window,
    in this case we should use the access token to get the user's email,
    and see if we already have a refresh token stored for that email address.
  2a. If we have a refresh token for that email address, return it.
  2b. If we don't have a refresh token for that email address, we will have to
    launch another oauth window which with "approval_prompt=force", so that
    the user grants us "offline access" again and we can get a refresh token
 */
GoogleSocialProvider.prototype.getCredentialsInteractive_ = function() {
  // First try to get a refresh token via the account chooser
  return new Promise(function(fulfill, reject) {
    // Check if there is any refresh token stored.  If not, always force the
    // approval prompt.  This is a small optimization to ensure that we always
    // get a refresh token on the 1st login attempt without needing to display
    // 2 oauth views.
    this.loadLastRefreshTokenAndEmail_().then(function(data) {
      var isFirstLoginAttempt = !(data && data.refreshToken);
      this.tryToGetRefreshToken_(isFirstLoginAttempt, null).then(function(responseObj) {
        // tryToGetRefreshToken_ should always give us an access_token, even
        // if no refresh_token is given.
        var accessToken = responseObj.access_token;
        if (!accessToken) {
          reject(new Error('Could not find access_token'));
        }

        // Get the user's email, needed loading/saving refresh tokens to/from
        // storage.
        this.getEmail_(accessToken).then(function(email) {
          if (responseObj.refresh_token) {
            // refresh_token was given on first attempt, all done.
            fulfill({
                refreshToken: responseObj.refresh_token,
                accessToken: accessToken,
                email: email});
            return;
          }

          // If no refresh_token is returned, it may mean that the user has already
          // granted this app a refresh token.  We should first check to see if we
          // already have a refresh token stored for this user, and if not we should
          // prompt them again with approval_prompt=force to ensure we get a refresh
          // token.
          // Note loadRefreshTokenForEmail_ will fulfill with null if there is
          // no refresh token saved.
          this.loadRefreshTokenForEmail_(email).then(function(refreshToken) {
            if (refreshToken) {
              // A refresh token had already been saved for this email, done.
              fulfill({
                  refreshToken: refreshToken,
                  accessToken: accessToken,
                  email: email});
              return;
            }

            // No refresh token was returned to us, or has been stored for this
            // email address (this would happen if the user already granted us
            // a token but re-installed the chrome app).  Try again forcing
            // the approval prompt for this email address.
            this.tryToGetRefreshToken_(true, email).then(function(responseObj) {
              if (responseObj.refresh_token) {
                fulfill({
                    refreshToken: responseObj.refresh_token,
                    accessToken: accessToken,
                    email: email});
              } else {
                reject(new Error('responseObj does not contain refresh_token'));
              }
            }.bind(this)).catch(function(error) {
              reject(new Error('Failed to get refresh_token with forcePrompt'));
            }.bind(this));
          }.bind(this));
        }.bind(this));
      }.bind(this));
    }.bind(this));
  }.bind(this));
};

GoogleSocialProvider.prototype.saveRefreshTokenForEmail_ =
    function(refreshToken, email) {
  this.storage.set('Google-Firebase-Refresh-Token:' + email, refreshToken);
};

GoogleSocialProvider.prototype.loadRefreshTokenForEmail_ = function(email) {
  return this.storage.get('Google-Firebase-Refresh-Token:' + email);
};

GoogleSocialProvider.prototype.saveLastRefreshTokenAndEmail_ =
    function(refreshToken, email) {
  this.storage.set('Google-Firebase-Refresh-Token-Last',
      JSON.stringify({refreshToken: refreshToken, email: email}));
};

GoogleSocialProvider.prototype.loadLastRefreshTokenAndEmail_ = function() {
  return new Promise(function(fulfill, reject) {
    this.storage.get('Google-Firebase-Refresh-Token-Last').then(function(data) {
      fulfill(JSON.parse(data));
    }.bind(this));
  }.bind(this));
};

// Returns Promise<{refreshToken, accessToken, email}>
GoogleSocialProvider.prototype.getCredentialsFromStorage_ = function() {
  return new Promise(function(fulfill, reject) {
    this.loadLastRefreshTokenAndEmail_().then(function(data) {
      if (!data) {
        reject(new Error('Could not load last refresh token and email'));
        return;
      }
      var email = data.email;
      var refreshToken = data.refreshToken;
      this.getAccessTokenFromRefreshToken_(refreshToken).then(
          function(accessToken) {
        fulfill({
            refreshToken: refreshToken,
            accessToken: accessToken,
            email: email});
      }.bind(this));  // end of getAccessTokenFromRefreshToken_
    }.bind(this));  // end of loadLastRefreshTokenAndEmail_
  }.bind(this));  // end of return new Promise
};

GoogleSocialProvider.prototype.getEmail_ = function(accessToken) {
  return new Promise(function(fulfill, reject) {
    var xhr = freedom["core.xhr"]();
    xhr.open('GET', 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json', true);
    xhr.on("onload", function() {
      xhr.getResponseText().then(function(responseText) {
        fulfill(JSON.parse(responseText).email);
      }.bind(this));
    }.bind(this));
    xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
    xhr.send();
  }.bind(this));
};

GoogleSocialProvider.prototype.getCode_ = function(
    oauth, stateObj, forcePrompt, authUserEmail) {
  var getCodeUrl = 'https://accounts.google.com/o/oauth2/auth?' +
           'response_type=code' +
           '&access_type=offline' +
           '&client_id=' + this.oAuthClientId +
           '&scope=' + this.oAuthScope +
           (forcePrompt ? '&approval_prompt=force' : '') +
           '&redirect_uri=' + encodeURIComponent(stateObj.redirect) +
           '&state=' + encodeURIComponent(stateObj.state);

  var url;
  if (authUserEmail) {
    // Skip account chooser and set the authuser param
    url = getCodeUrl + '&authuser=' + authUserEmail;
  } else {
    // Got to account chooser.
    url = 'https://accounts.google.com/accountchooser?continue=' +
        encodeURIComponent(getCodeUrl);
  }

  return oauth.launchAuthFlow(url, stateObj).then(function(responseUrl) {
    return responseUrl.match(/code=([^&]+)/)[1];
  }.bind(this));
};

// Returns a Promise which fulfills with the object Google gives us upon
// requesting a refresh token.  This object will always have an access_token,
// but may not have a refresh_token if forcePrompt==false.
GoogleSocialProvider.prototype.tryToGetRefreshToken_ = function(
    forcePrompt, authUserEmail) {
  return new Promise(function(fulfill, reject) {
    var oauth = freedom["core.oauth"]();
    return oauth.initiateOAuth(this.oAuthRedirectUris).then(function(stateObj) {
      this.getCode_(
          oauth, stateObj, forcePrompt, authUserEmail).then(function(code) {
        var data = 'code=' + code +
            '&client_id=' + this.oAuthClientId +
            '&client_secret=' + this.clientSecret +
            "&redirect_uri=" + encodeURIComponent(stateObj.redirect) +
            '&grant_type=authorization_code';
        var xhr = freedom["core.xhr"]();
        xhr.open('POST', 'https://www.googleapis.com/oauth2/v3/token', true);
        xhr.setRequestHeader(
            'content-type', 'application/x-www-form-urlencoded');
        xhr.on('onload', function() {
          xhr.getResponseText().then(function(responseText) {
            fulfill(JSON.parse(responseText));
          });
        });
        xhr.send({string: data});
      }.bind(this));
    }.bind(this));
  }.bind(this));
};

GoogleSocialProvider.prototype.getAccessTokenFromRefreshToken_ =
    function(refreshToken) {
  return new Promise(function(fulfill, resolve) {
    var data = 'refresh_token=' + refreshToken +
        '&client_id=' + this.oAuthClientId +
        '&client_secret=' + this.clientSecret +
        '&grant_type=refresh_token';
    var xhr = freedom["core.xhr"]();
    xhr.open('POST', 'https://www.googleapis.com/oauth2/v3/token', true);
    xhr.setRequestHeader('content-type', 'application/x-www-form-urlencoded');
    xhr.on('onload', function() {
      xhr.getResponseText().then(function(responseText) {
        fulfill(JSON.parse(responseText).access_token);
      });
    });
    xhr.send({string: data});
  }.bind(this));
};