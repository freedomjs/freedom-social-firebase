FacebookSocialProvider = function(dispatchEvent) {
  console.log('FacebookSocialProvider called');
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'facebook';
  this.initState_();
};
// TODO: this seems weird
FacebookSocialProvider.prototype = new FirebaseSocialProvider();

FacebookSocialProvider.prototype.getOAuthToken = function() {
  // TODO: get facebook tokens...
  // Tokens just need user_friends permission
  return Promise.resolve('');
};

// Returns an array of objects containing name and id.
FacebookSocialProvider.prototype.loadFriends_ = function() {
  // TODO: should we periodically check for new friends?  Or just force
  // users to logout then login again to detect new friends?

  if (!this.loginState_) {
    return Promise.reject('Not signed in');
  }

  return new Promise(function(fulfill, reject) {
    var xhr = new XMLHttpRequest();
    var url = 'https://graph.facebook.com/v2.1/me/friends?access_token=' +
        this.loginState_.authData.facebook.accessToken;
    xhr.open('GET', url);
    // TODO: error checking
    xhr.onload = function() {
      // TODO: handle paging
      fulfill(JSON.parse(this.response).data);
    };
    xhr.send();
  }.bind(this));
}
