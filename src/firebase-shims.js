// Set window.
if (typeof global !== 'undefined') {
  if (typeof window === 'undefined') {
    global.window = {};
  }
} else {
  if (typeof window === 'undefined') {
    var window = {};
  }
}

// Set document.
if (typeof global !== 'undefined') {
  if (typeof document === 'undefined') {
    global.document = {};
  }
} else {
  if (typeof document === 'undefined') {
    var document = {};
  }
}

if (XMLHttpRequest && !window.XMLHttpRequest) {
  window.XMLHttpRequest = XMLHttpRequest;
}

// WebSocket shim, currently needed for Firefox workers to use sockets
if (typeof WebSocket === 'undefined') {
  console.log('shimming WebSocket');
  WebSocket = function(url, protocols) {
    var ws = new freedom['core.websocket'](url, protocols);
    console.log(ws);
    this.send = ws.send;
    this.close = ws.close;
    ws.on('onOpen', this.onopen);
    ws.on('onClose', this.onclose);
    ws.on('onMessage', this.onmessage);
    ws.on('onError', this.onerror);
  };
}