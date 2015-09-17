GoogleSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'google';
  this.initLogger_('GoogleSocialProvider');
  this.initState_();
};
GoogleSocialProvider.prototype = new FirebaseSocialProvider();

/*
 * Returns UserProfile object for the logged in user.
 */
GoogleSocialProvider.prototype.getMyImage_ = function() {
  if (!this.loginState_) {
    throw 'Error in GoogleSocialProvider.getMyImage_: not logged in';
  }
  return this.loginState_.authData[this.networkName_].cachedUserProfile
      .picture + '?sz=50';
};

/*
 * Makes post request to Google endpoint, and returns a Promise which
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
    xhr.onload = function() {
      fulfill(JSON.parse(this.response));
    };
    xhr.onerror = function(e) {
      reject('Error posting to Google ' + e);
    };
    xhr.send(data);
  });
};

GoogleSocialProvider.prototype.sendEmail = function(to, subject, body) {
  if (!this.loginState_) {
    throw 'Not signed in';
  }
  var email ='"Content-Type: text/plain; charset="us-ascii"\n' +
      'MIME-Version: 1.0\n' +
      'Content-Transfer-Encoding: 7bit\n' +
      'to: ' + to + '\n' +
      'from: ' + this.loginState_.authData[this.networkName_].email + '\n' +
      'subject: ' + subject + '\n\n' + body;
  return this.googlePost_('gmail/v1/users/me/messages/send',
      JSON.stringify({raw: btoa(email)}))
      .then(function() {
        // Return Promise<void> to match sendEmail definition.
        return Promise.resolve();
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
