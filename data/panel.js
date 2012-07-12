var notifications = [];
var sites = [];
var DB = {};

var dumpObj = function(obj, name){
  if (name) {
    console.info("=== Dumping", name, typeof(obj));
  }
  switch (typeof(obj)) {
    case 'object':
      keys = Object.keys(obj);
      for(var i=0;i<keys.length;i++){
        console.info(' ',keys[i],
          typeof(obj[keys[i]])=='function' ? '()' : JSON.stringify(obj[keys[i]]))
      }
      console.info('===');
      break;
    case 'string':
    case 'number':
      console.info(obj);
      break;
    default:
      console.info(typeof(obj))
  }
}

self.port.on('setDB', function(data) {
  console.debug('setting DB');
  DB = data;
});

self.port.on('message:init', function(data) {
  dumpObj(data, 'panel->message:init.messages');
  if (data.notifications){
    console.debug('initializing notifications', data.notifications.length);
    notifications = data.notifications;
  }
  render();
});

self.port.on('message', function(message) {
  console.debug('panel: recvd message', notifications.length);
  dumpObj(message, 'panel:message');
  dumpObj(notifications, 'panel:notifications');
  notifications.push(message);
  render();
});

self.port.on('delete', function(index) {
  notifications.splice(index, 1);
  render();
});

document.addEventListener('click', function(e) {
  var depth=0;
  for (var el = e.target; el.parentNode; el = el.parentNode) {
    console.debug('click', depth++, JSON.stringify(e), JSON.stringify(el.classList));
    if (el.tagName.toLowerCase() == 'a') {
      e.preventDefault();
      self.port.emit('click', el.getAttribute('href'),
                     /* Middle click triggers background tab. */
                     e.button == 1);
      if (el.hasAttribute('data-index')) {
        self.port.emit('delete', el.getAttribute('data-index'));
      }
      return;
    }
    if (el.classList.contains('del')) {
      e.preventDefault();
      self.port.emit('delete', el.parentNode.parentNode.getAttribute('data-index'));
      return;
    }
    if (el.classList.contains('header-link')) {
      document.body.classList.toggle('flipped');
      return;
    }
    if (el.parentNode.id == 'tabs') {
      selectTab(el);
      return
    }
    if (el.id == 'trash') {
      clearAll();
      return
    }
    if (el.classList.contains('pause-site')) {
      site = el.getAttribute('data-id');
      self.port.emit('pause', site);
      return;
    }
    if (el.classList.contains('kill-site')) {
      site = el.getAttribute('data-id');
      console.debug('killing ', site);
      self.port.emit('kill', site);
      return;
    }
  }
});

function $(s) {
  return document.getElementById(s);
}

function $$(s) {
  return Array.prototype.slice.call(document.querySelectorAll(s));
}

function clearAll() {
  self.port.emit('clear-all');
  notifications = [];
  render();
}

function selectTab(el) {
  $$('#tabs .selected, .tab.selected').forEach(function(e) {
    e.classList.toggle('selected');
  });
  el.classList.add('selected');
  $(el.getAttribute('data-target')).classList.add('selected');
}

function render() {
  var list = $('notifications'),
      template = $('notifications-template').textContent,
      view = {sites:[], settings:{}},
      sites=[];

  dumpObj(notifications, 'rendering...');
  notifications.sort(function(a, b) {
    if (a.time < b.time) return 1;
    if (a.time > b.time) return -1;
    return 0;
  });

  // Clean up the notifications.
  notifications.forEach(function(e, index) {
    e.prettyTime = prettyDate(e.time);
    e.index = index;
    e.name = DB['domain:' + e.token] || 'Unknown';
  });

  // notifications.groupBy('site')
  groups = {};
  notifications.forEach(function(e) {
    var key = e.site;
    (groups[key] || (groups[key] = [])).push(e);
  });

  for (var domain in groups) {
    var site = {domain: domain == 'welcome' ? 'mozilla.org' : domain,
                name: DB['domain:' + domain],
                icon: icons[domain] || icons["default"]};
    site.notifications = groups[domain];
    view.sites.push(site);
  }
  view['settings']['sites'] == DB.sites;

  console.debug('render view', JSON.stringify(view),"\n DB", JSON.stringify(DB));
  list.innerHTML = Mustache.render(template, view);
  renderSettings(view);
}

function renderSettings(view) {
  console.debug('renderSettings');
  if (!$('site-settings-template')) {
    return;
  }
  var list = $('site-settings'),
      template = $('site-settings-template').textContent,
      sites = {};

  notifications.forEach(function(e) {
    // Add the site if it's not there.
    if (!(e.site in sites)) {
      if (e.site == undefined) {
        console.debug("Undefined domain")
        name = 'Unknown';
        dumpObj(e, 'Unknown site element');
      }
      console.debug("Settings: Adding site", JSON.stringify(e.site));
      view.sites.push({name: e.site || 'Unknown',
                       token: e.token,
                       icon: icons[domain] || icons["default"],
                       latest: e.prettyTime});
      sites[e.site] = true;
    }
  });
  console.debug('notifications length', notifications.length);
  console.debug('Rendering settings', JSON.stringify(view));
  list.innerHTML = Mustache.render(template, view);
}

var icons = {
  "Welcome": "http://z.jbalogh.me/heart.png",
  "github.jbalogh.me": "https://github.com/favicon.ico",
  "github-notifications.herokuapp.com": "https://github.com/favicon.ico",
  "default": "http://z.jbalogh.me/signal.png",
  "facebook.com": "http://a3.mzstatic.com/us/r1000/086/Purple/03/df/55/mzl.ziwhldlf.175x175-75.jpg",
  "foursquare.com": "https://static-s.foursquare.com/img/touch-icon-ipad-1d5a99e90171f6a0cc2f74920ec24021.png",
  "twitter.com": "https://si0.twimg.com/twitter-mobile/d23caade6d08e27a428c5e60a1b67371ccaf4569/images/apple-touch-icon-114.png",
  "nytimes.com": "http://graphics8.nytimes.com/webapps/skimmer/2.4/images/skmr_256.png",
  "tumblr.com": "http://assets.tumblr.com/images/apple_touch_icon.png"
};
