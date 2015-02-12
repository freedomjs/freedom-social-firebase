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
