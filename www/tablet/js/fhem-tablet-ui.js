/* FHEM tablet ui */
/**
 * UI builder framework for FHEM
 *
 * Version: 3.0.0
 *
 * Copyright (c) 2015-2019 Mario Stephan <mstephan@shared-files.de>
 * Under MIT License (http://www.opensource.org/licenses/mit-license.php)
 * https://github.com/knowthelist/fhem-tablet-ui
 */

'use strict';

// -------------Notifications----------
class Notification {
  constructor() {
    this.observers = [];
  }

  subscribe(observer, context) {
    if (void 0 === context) { context = observer; }
    this.observers.push({ observer: observer });
  }

  publish(args) {
    this.observers.forEach(topic => topic.observer(args));
  }
}

// ---------------FTUI Widget base-----------------

class FtuiWidget extends HTMLElement {
  constructor(defaults) {
    super();

    const attributes = {};
    [...this.attributes].forEach(attr => {
      const name = attr.name.replace(/-([a-z])/g, (char) => { return char[1].toUpperCase() });
      attributes[name] = attr.value
    });
    Object.assign(this, defaults, attributes);
  }

  submitUpdate(deviceReading) {
    const cmdl = [this.cmd, deviceReading, this.value].join(' ');
    ftui.sendFhemStatus(cmdl);
    ftui.toast(cmdl);
  }

  allStyles(attribute) {
    const map = ftui.parseObject(attribute);
    return Object.values(map).map(value => value).join(' ').split(' ').filter(String);
  }

  matchingStyles(attribute, param) {
    const matchValue = ftui.matchingValue(attribute, param.value);
    return matchValue ? matchValue.split(' ').filter(String) : [];
  }
}

// -------- FTUI ----------

const ftui = {

  version: '3.3.0',
  config: {
    DEBUG: false,
    dir: '',
    filename: '',
    basedir: '',
    fhemDir: '',
    debuglevel: 0,
    doLongPoll: true,
    lang: 'de',
    toastPosition: 'bottomLeft',
    shortpollInterval: 0
  },

  poll: {
    short: {
      lastTimestamp: new Date(),
      timer: null,
      request: null,
      result: null,
      lastErrorToast: null
    },
    long: {
      xhr: null,
      currLine: 0,
      lastUpdateTimestamp: new Date(),
      lastEventTimestamp: new Date(),
      timer: null,
      result: null,
      lastErrorToast: null
    }
  },

  states: {
    width: 0,
    lastSetOnline: 0,
    lastShortpoll: 0,
    longPollRestart: false,
    inits: []
  },

  db: {},
  deviceStates: {},
  parameterData: {},
  paramIdMap: {},
  timestampMap: {},
  subscriptions: {},
  subscriptionTs: {},
  scripts: [],
  notifications: {},
  Notifications: function (id) {
    let notification = id && ftui.notifications[id];
    if (!notification) {
      notification = new Notification();
      if (id) {
        ftui.notifications[id] = notification;
      }
    }
    return notification;
  },

  init: function () {
    //ftui.hideWidgets('html');

    ftui.config.meta = document.getElementsByTagName('META');
    const longpoll = ftui.getMetaString('longpoll', '1');
    ftui.config.doLongPoll = (longpoll !== '0');
    ftui.config.shortPollFilter = ftui.getMetaString('shortpoll_filter');
    ftui.config.longPollFilter = ftui.getMetaString('longpoll_filter');

    ftui.config.debuglevel = ftui.getMetaNumber('debug');
    ftui.config.maxLongpollAge = ftui.getMetaNumber('longpoll_maxage', 240);
    ftui.config.DEBUG = (ftui.config.debuglevel > 0);
    ftui.config.TOAST = ftui.getMetaNumber('toast', 5); // 1,2,3...= n Toast-Messages, 0: No Toast-Messages
    ftui.config.toastPosition = ftui.getMetaString('toast_position', 'bottomLeft');
    ftui.config.shortpollInterval = ftui.getMetaNumber('shortpoll_only_interval', 30);
    ftui.config.shortPollDelay = ftui.getMetaString('shortpoll_restart_delay', 3000);
    // self path
    const url = window.location.pathname;
    ftui.config.filename = url.substring(url.lastIndexOf('/') + 1);
    ftui.log(1, 'Filename: ' + ftui.config.filename);
    const fhemUrl = ftui.getMetaString('fhemweb_url');
    ftui.config.fhemDir = fhemUrl || window.location.origin + '/fhem/';
    if (fhemUrl && new RegExp('^((?!http://|https://).)*$').test(fhemUrl)) {
      ftui.config.fhemDir = window.location.origin + '/' + fhemUrl + '/';
    }
    ftui.config.fhemDir = ftui.config.fhemDir.replace('///', '//');
    ftui.log(1, 'FHEM dir: ' + ftui.config.fhemDir);
    // lang
    const userLang = navigator.language || navigator.userLanguage;
    ftui.config.lang = ftui.getMetaString('lang', ((ftui.isValid(userLang)) ? userLang.split('-')[0] : 'de'));
    // credentials
    ftui.config.username = ftui.getMetaString('username');
    ftui.config.password = ftui.getMetaString('password');
    // subscriptions
    ftui.devs = [ftui.config.webDevice];
    ftui.reads = ['STATE'];

    const initDeferreds = [ftui.getCSrf()];

    // init Toast
    function configureToast() {
      if (window.vNotify && !ftui.selectOne('link[href$="css/vanilla-notify.css"]')) {
        ftui.appendStyleLink(ftui.config.basedir + 'css/vanilla-notify.css');
      }
    }

    if (!window.vNotify) {
      ftui.dynamicload(ftui.config.basedir + 'lib/vanilla-notify.min.js', false).then(function () {
        configureToast();
      });
    } else {
      configureToast();
    }

    // after the page became visible, check server connection
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // page is hidden
      } else {
        // page is visible
        ftui.log(1, 'Page became visible again -> start healthCheck in 3 secondes ');
        setTimeout(function () {
          ftui.healthCheck();
        }, 3000);
      }
    });

    try {
      // try to use localStorage
      localStorage.setItem('ftui_version', ftui.version);
      localStorage.removeItem('ftui_version');
    } catch (e) {
      // there was an error so...
      ftui.toast('You are in Privacy Mode<br>Please deactivate Privacy Mode and then reload the page.', 'error');
    }

    // detect clickEventType
    const android = ftui.getAndroidVersion();
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const onlyTouch = ((android && parseFloat(android) < 5) || iOS);
    ftui.config.clickEventType = (onlyTouch) ? 'touchstart' : 'touchstart mousedown';
    ftui.config.moveEventType = ((onlyTouch) ? 'touchmove' : 'touchmove mousemove');
    ftui.config.releaseEventType = ((onlyTouch) ? 'touchend' : 'touchend mouseup');
    ftui.config.leaveEventType = ((onlyTouch) ? 'touchleave' : 'touchleave mouseout');
    ftui.config.enterEventType = ((onlyTouch) ? 'touchenter' : 'touchenter mouseenter');

    // add background for modal dialogs
    const shade = `<div id="shade" class="hide"/>`;
    document.body.insertAdjacentHTML('beforeend', shade);
    document.getElementById('shade').addEventListener(ftui.config.clickEventType, () => {
      ftui.triggerEvent('shadeClicked');
    });

    // init Page after CSFS Token has been retrieved
    Promise.all(initDeferreds).then(() => {
      ftui.initPage('html');
    }).catch(error => {
      ftui.log(1, 'initDeferreds -' + error, 'error');
    });

    document.addEventListener('initWidgetsDone', () => {
      // restart longpoll
      ftui.states.longPollRestart = true;
      ftui.restartLongPoll();
      ftui.initHeaderLinks();

      // start shortpoll delayed
      ftui.startShortPollInterval(500);

      // trigger refreshs
      ftui.triggerEvent('changedSelection');
    });

    setInterval(function () {
      ftui.healthCheck();
    }, 60000);
  },

  initPage: function (area) {
    area = (ftui.isValid(area)) ? area : 'html';
    window.performance.mark('start initPage-' + area);

    ftui.states.startTime = new Date();
    ftui.log(2, 'initPage - area=' + area);

    ftui.log(1, 'init templates - Done');
    ftui.initWidgets(area).then(() => {
      window.performance.mark('end initPage-' + area);
      window.performance.measure('initPage-' + area, 'start initPage-' + area, 'end initPage-' + area);
      const dur = 'initPage (' + area + '): in ' + (new Date() - ftui.states.startTime) + 'ms';
      if (ftui.config.debuglevel > 1) ftui.toast(dur);
      ftui.log(1, dur);
    }).catch(error => {
      ftui.log(1, 'initWidgets -' + error, 'error');
    });

  },

  initWidgets: function (area) {
    const initDefer = ftui.deferred();
    area = (ftui.isValid(area)) ? area : 'html';
    const widgetTypes = [];
    // Fetch all the children of <ftui-*> that are not defined yet.
    const undefineWidgets = ftui.selectElements(':not(:defined)', area);

    undefineWidgets.forEach(elem => {
      const type = elem.localName;
      // ToDo: use filter
      if (!widgetTypes.includes(type)) {
        widgetTypes.push(type);
      }
    });


    const regexp = new RegExp('^ftui-[a-z]+$', 'i');
    widgetTypes
      .filter(type => {

        const match = regexp.test(type);
        return match;
      })
      .forEach(type => {
        ftui.dynamicload(ftui.config.basedir + 'js/' + type.replace('-', '.') + '.js', true)
      });

    const promises = [...undefineWidgets].map(widget => {
      //console.log(widget);
      return customElements.whenDefined(widget.localName);
    });

    // get current values of readings not before all widgets are loaded
    Promise.all(promises).then(() => {
      ftui.updateParameters();
      ftui.log(1, 'initWidgets - Done');
      const event = new CustomEvent('initWidgetsDone', { area: area });
      document.dispatchEvent(event);

      initDefer.resolve();
    })
      .catch(error => {
        ftui.log(1, 'initWidgets -' + error, 'error');
      });
    return initDefer.promise();
  },

  initHeaderLinks: function () {

    if (ftui.selectAll('[class*=oa-]').length && !ftui.selectAll('link[href$="css/openautomation.min.css"]').length) {
      ftui.appendStyleLink(ftui.config.basedir + 'css/openautomation.min.css');
    }
    if (ftui.selectAll('[class*=fs-]').length && !ftui.selectAll('link[href$="css/fhemSVG.css"]').length) {
      ftui.appendStyleLink(ftui.config.basedir + 'lib/fhemSVG.css');
    }
    if (ftui.selectAll('[class*=mdi-]').length && !ftui.selectAll('link[href$="css/materialdesignicons.min.css"]').length) {
      ftui.appendStyleLink(ftui.config.basedir + 'css/materialdesignicons.min.css');
    }
    if (ftui.selectAll('[class*=wi-]').length && !ftui.selectAll('link[href$="css/weather-icons.min.css"]').length) {
      ftui.appendStyleLink(ftui.config.basedir + 'css/weather-icons.min.css');
    }
    if (ftui.selectAll('[class*=wi-wind]').length && !ftui.selectAll('link[href$="css/weather-icons-wind.min.css"]').length) {
      ftui.appendStyleLink(ftui.config.basedir + 'css/weather-icons-wind.min.css');
    }
    if (ftui.selectAll('[class*=fa-]').length ||
      !ftui.selectAll('link[href$="css/font-awesome.min.css"]').length
    ) {
      ftui.appendStyleLink(ftui.config.basedir + 'css/font-awesome.min.css');
    }
  },

  parseDeviceReading: function (deviceReading) {
    const [, device, reading] = /^([^-:]+)[-:](.*)$/.exec(deviceReading) || ['', deviceReading, 'STATE'];
    const paramid = (reading === 'STATE') ? device : [device, reading].join('-');
    return [paramid, device, reading];
  },

  addReading: function (deviceReading) {
    if (ftui.isValid(deviceReading)) {
      const [paramid, device, reading] = ftui.parseDeviceReading(deviceReading);
      if (!ftui.subscriptions[paramid]) {
        ftui.subscriptions[paramid] = { device: device, reading: reading };
      }
      return ftui.Notifications(paramid);
    } else {
      return { subscribe: () => { } }
    }
  },

  updateParameters: function () {

    ftui.devs = [... new Set(Object.values(ftui.subscriptions).map(value => (value.device)))];
    ftui.reads = [... new Set(Object.values(ftui.subscriptions).map(value => (value.reading)))];

    // build filter
    const devicelist = (ftui.devs.length) ? ftui.devs.join() : '.*';
    const readinglist = (ftui.reads.length) ? ftui.reads.join(' ') : '';

    ftui.poll.long.filter = ftui.config.longPollFilter ? ftui.config.longPollFilter : devicelist + ', ' + readinglist;
    ftui.poll.short.filter = ftui.config.shortPollFilter ? ftui.config.shortPollFilter : devicelist + ' ' + readinglist;

    // force shortpoll
    ftui.states.lastShortpoll = 0;
  },

  isFhemWebInternal(deviceName) {
    return deviceName.includes('FHEMWEB') && deviceName.match(/WEB_\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}_\d{5}/);
  },

  startLongpoll: function () {
    ftui.log(2, 'startLongpoll: ' + ftui.config.doLongPoll);
    ftui.poll.long.lastEventTimestamp = new Date();
    if (ftui.config.doLongPoll) {
      ftui.config.shortpollInterval = ftui.getMetaNumber('shortpoll_interval', 15 * 60); // 15 minutes
      ftui.poll.long.timer = setTimeout(function () {
        ftui.longPoll();
      }, 0);
    }
  },

  stopLongpoll: function () {
    ftui.log(2, 'stopLongpoll');
    clearInterval(ftui.poll.long.timer);
    if (ftui.poll.long.websocket) {
      if (ftui.poll.long.websocket.readyState === WebSocket.OPEN) {
        ftui.poll.long.websocket.close();
      }
      ftui.poll.long.websocket = undefined;
      ftui.log(2, 'stopped websocket');
    }
  },

  restartLongPoll: function (msg, error) {
    ftui.log(2, 'restartLongpoll');
    let delay;
    clearTimeout(ftui.poll.long.timer);
    if (msg) {
      ftui.toast('Disconnected from FHEM<br>' + msg, error);
    }

    ftui.stopLongpoll();

    if (ftui.states.longPollRestart) {
      delay = 0;
    } else {
      ftui.toast('Retry to connect in 10 seconds');
      delay = 10000;
    }

    ftui.poll.long.timer = setTimeout(function () {
      ftui.startLongpoll();
    }, delay);
  },

  forceRefresh: function () {
    ftui.states.lastShortpoll = 0;
    ftui.shortPoll();
  },

  startShortPollInterval: function (delay) {
    ftui.log(1, 'shortpoll: start in (ms):' + (delay || ftui.config.shortpollInterval * 1000));
    clearInterval(ftui.poll.short.timer);
    ftui.poll.short.timer = setTimeout(function () {
      // get current values of readings every x seconds
      ftui.shortPoll();
      ftui.startShortPollInterval();
    }, (delay || ftui.config.shortpollInterval * 1000));
  },

  shortPoll: function (silent) {
    const ltime = Date.now() / 1000;
    if ((ltime - ftui.states.lastShortpoll) < ftui.config.shortpollInterval) { return; }
    ftui.log(1, 'start shortpoll');
    window.performance.mark('start shortpoll');
    ftui.states.lastShortpoll = ltime;

    // invalidate all readings for detection of outdated ones
    let i = ftui.devs.length;
    while (i--) {
      const params = ftui.deviceStates[ftui.devs[i]];
      for (const reading in params) {
        params[reading].valid = false;
      }
    }
    window.performance.mark('start get jsonlist2');
    ftui.poll.short.request =
      ftui.sendFhemCommand('jsonlist2 ' + ftui.poll.short.filter)
        .then(res => res.json())
        .then(fhemJSON => this.parseShortpollResult(fhemJSON, silent)
        )
    // .catch(error => {
    //   ftui.log(1, 'shortPoll: request failed: 111111' + error, 'error');
    //   ftui.poll.short.result = error;
    //   ftui.states.lastSetOnline = 0;
    //   ftui.states.lastShortpoll = 0;
    // });
  },

  parseShortpollResult: function (fhemJSON, silent) {

    window.performance.mark('end get jsonlist2');
    window.performance.measure('get jsonlist2', 'start get jsonlist2', 'end get jsonlist2');
    window.performance.mark('start read jsonlist2');

    // function to import data
    function checkReading(device, section) {
      for (const reading in section) {
        const paramerId = (reading === 'STATE') ? device : [device, reading].join('-');
        let deviceReading = section[reading];
        if (typeof deviceReading !== 'object') {
          // ftui.log(5,'paramid='+paramid+' newParam='+newParam);

          deviceReading = {
            'Value': deviceReading,
            'Time': ''
          };
        }

        // is there a subscription, then check and update widgets
        if (ftui.subscriptions[paramerId]) {
          const param = ftui.parameterData[paramerId] || {};
          const isUpdate = (!param || param.value !== deviceReading.Value || param.time !== deviceReading.Time);

          ftui.log(5, ['handleUpdate()', ' paramerId=', paramerId, ' value=', deviceReading.Value,
            ' time=', deviceReading.Time, ' isUpdate=', isUpdate].join(''));

          // write into internal cache object
          param.value = deviceReading.Value;
          param.time = deviceReading.Time;
          param.update = new Date().format('YYYY-MM-DD hh:mm:ss');

          // update widgets only if necessary
          if (isUpdate) {
            ftui.log(3, ['handleUpdate() publish update for ', paramerId].join(''));
            ftui.parameterData[paramerId] = param;
            // console.log(paramerId, ftui.parameterData[paramerId], param.value);
            ftui.Notifications(paramerId).publish(param);
          }
        }
      }
    }
    // import the whole fhemJSON
    if (fhemJSON && fhemJSON.Results) {
      fhemJSON.Results.forEach(device => {
        if (!ftui.isFhemWebInternal(device.Name)) {
          checkReading(device.Name, device.Internals);
          checkReading(device.Name, device.Attributes);
          checkReading(device.Name, device.Readings);
        }
      });

      // finished
      window.performance.mark('end shortpoll');
      window.performance.measure('shortpoll', 'start shortpoll', 'end shortpoll');
      const duration = window.performance.getEntriesByName('shortpoll', 'measure')[0].duration;
      if (ftui.config.debuglevel > 1) {
        const paramCount = fhemJSON.Results.length;
        ftui.toast('Full refresh done in ' +
          duration.toFixed(0) + 'ms for ' +
          paramCount + ' parameter(s)');
      }
      ftui.log(1, 'shortPoll: Done');
      if (ftui.poll.short.lastErrorToast) {
        ftui.poll.short.lastErrorToast.reset();
      }
      ftui.poll.short.duration = duration * 1000;
      ftui.poll.short.lastTimestamp = new Date();
      ftui.poll.short.result = 'ok';

      if (!silent) {
        ftui.onUpdateDone();
      }
    } else {
      const err = 'request failed: Result is null';
      ftui.log(1, 'shortPoll: ' + err);
      ftui.poll.short.result = err;
      ftui.toast('<u>ShortPoll ' + err + ' </u><br>', 'error');

    }
    window.performance.mark('end read jsonlist2');
    window.performance.measure('read jsonlist2', 'start read jsonlist2', 'end read jsonlist2');
    if (ftui.config.debuglevel > 1) {
      let performance = '';
      window.performance.getEntriesByType('measure').forEach(entry => {
        performance += [entry.name, ':', entry.duration.toFixed(0), 'ms', '<br>'].join(' ');
      })
      window.performance.clearMeasures();
      window.performance.clearMarks();
      ftui.toast(performance);
    }
  },

  longPoll: function () {

    if (ftui.poll.long.websocket) {
      ftui.log(3, 'valid ftui.poll.long.websocket found');
      return;
    }
    if (ftui.poll.long.lastErrorToast) {
      ftui.poll.long.lastErrorToast.reset();
    }
    if (ftui.config.debuglevel > 1) {
      ftui.toast('Longpoll started');
    }
    ftui.poll.long.URL = ftui.config.fhemDir.replace(/^http/i, 'ws') + '?XHR=1&inform=type=status;filter=' +
      ftui.poll.long.filter + ';since=' + ftui.poll.long.lastEventTimestamp.getTime() + ';fmt=JSON' +
      '&timestamp=' + Date.now();
    // "&fwcsrf=" + ftui.config.csrf;

    ftui.log(1, 'websockets URL=' + ftui.poll.long.URL);
    ftui.states.longPollRestart = false;

    ftui.poll.long.websocket = new WebSocket(ftui.poll.long.URL);
    ftui.poll.long.websocket.onclose = function (event) {
      let reason;
      if (event.code == 1000) {
        reason =
          'Normal closure, meaning that the purpose for which the connection was established has been fulfilled.';
      } else if (event.code == 1001) {
        reason =
          'An endpoint is "going away", such as a server going down or a browser having navigated away from a page.';
      } else if (event.code == 1002) { reason = 'An endpoint is terminating the connection due to a protocol error'; } else if (event.code == 1003) {
        reason =
          'An endpoint is terminating the connection because it has received a type of data it cannot accept (e.g., an endpoint that understands only text data MAY send this if it receives a binary message).';
      } else if (event.code == 1004) { reason = 'Reserved. The specific meaning might be defined in the future.'; } else if (event.code == 1005) { reason = 'No status code was actually present.'; } else if (event.code == 1006) { reason = 'The connection was closed abnormally, e.g., without sending or receiving a Close control frame'; } else if (event.code == 1007) {
        reason =
          'An endpoint is terminating the connection because it has received data within a message that was not consistent with the type of the message (e.g., non-UTF-8 [http://tools.ietf.org/html/rfc3629] data within a text message).';
      } else if (event.code == 1008) {
        reason =
          'An endpoint is terminating the connection because it has received a message that "violates its policy". This reason is given either if there is no other sutible reason, or if there is a need to hide specific details about the policy.';
      } else if (event.code == 1009) {
        reason =
          'An endpoint is terminating the connection because it has received a message that is too big for it to process.';
      } else if (event.code == 1010) // Note that this status code is not used by the server, because it can fail the WebSocket handshake instead.
      {
        reason =
          'An endpoint (client) is terminating the connection because it has expected the server to negotiate one or more extension, but the server didn\'t return them in the response message of the WebSocket handshake. <br /> Specifically, the extensions that are needed are: ' +
          event.reason;
      } else if (event.code == 1011) {
        reason =
          'A server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request.';
      } else if (event.code == 1015) {
        reason =
          'The connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can\'t be verified).';
      } else { reason = 'Unknown reason'; }
      ftui.log(1, 'websocket (url=' + event.target.url + ') closed!  reason=' + reason);
      // if current socket closes then restart websocket
      if (event.target.url === ftui.poll.long.URL) {
        ftui.restartLongPoll(reason);
      }
    };
    ftui.poll.long.websocket.onerror = function (event) {
      ftui.log(1, 'Error while longpoll: ' + event.data);
      if (ftui.config.debuglevel > 1 && event.target.url === ftui.poll.long.URL) {
        ftui.poll.long.lastErrorToast = ftui.toast('Error while longpoll', 'error');
      }

    };
    ftui.poll.long.websocket.onmessage = function (msg) {
      ftui.handleLongpollUpdates(msg.data);
    };


  },

  handleLongpollUpdates: function (data) {
    const lines = data.split(/\n/);
    lines.forEach(line => {
      ftui.log(5, line);
      const lastChar = line.slice(-1);
      if (ftui.isValid(line) && line !== '' && lastChar === ']' && !ftui.isFhemWebInternal(line)) {

        const dataJSON = JSON.parse(line);
        const id = dataJSON[0];
        const value = dataJSON[1];
        const html = dataJSON[2];
        const isSTATE = (value !== html);
        const isTimestamp = id.match(/-ts$/);
        const isTrigger = (value === '' && html === '');
        const paramId = isTimestamp ? id.replace(/-ts$/, '') : id;
        const param = ftui.parameterData[paramId] || {};

        ftui.log(4, dataJSON);
        param.update = new Date().format('YYYY-MM-DD hh:mm:ss');
        if (isTimestamp) {
          param.time = value;
        } else if (isSTATE) {
          param.time = param.update;
          param.value = value;
        } else if (!isTimestamp) {
          param.value = value;
        }
        ftui.parameterData[paramId] = param;

        if (isTimestamp || isSTATE || isTrigger) {
          ftui.Notifications(paramId).publish(param);
        }
      }
    });
    ftui.poll.long.lastEventTimestamp = new Date();
  },

  transmitCommand: function (widget) {
    const cmdl = [widget.cmd, widget.device, widget.set, widget.value].join(' ');
    ftui.sendFhemStatus(cmdl);
    ftui.toast(cmdl);
  },

  sendFhemStatus: function (cmdline) {
    ftui.sendFhemCommand(cmdline)
      .then(ftui.handleFetchErrors)
      .then(response => ftui.log(3, response))
      .catch(error => ftui.toast('<u>FHEM Command failed</u><br>' + error + '<br>cmd=' + cmdline, 'error'));
  },

  sendFhemCommand: function (cmdline) {
    const url = new URL(ftui.config.fhemDir);
    const params = {
      cmd: cmdline,
      fwcsrf: ftui.config.csrf,
      XHR: '1'
    };
    url.search = new URLSearchParams(params)
    const dataType = (cmdline.substr(0, 8) === 'jsonlist') ? 'application/json' : 'text/plain"';
    ftui.log(1, 'send to FHEM: ' + cmdline);
    return fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': dataType
      },
      username: ftui.config.username,
      password: ftui.config.password
    });
  },

  onUpdateDone: function () {
    ftui.triggerEvent('updateDone');
    ftui.checkInvalidElements();
  },

  checkInvalidElements: function () {
    ftui.selectAll('.autohide[data-get]').forEach(elem => {
      const valid = elem.getReading('get').valid;
      if (valid && valid === true) {
        elem.classList.remove('invalid');
      } else {
        elem.classList.add('invalid');
      }
    });
  },

  setOnline: function () {
    const ltime = Date.now() / 1000;
    if ((ltime - ftui.states.lastSetOnline) > 60) {
      if (ftui.config.DEBUG) ftui.toast('FHEM connected');
      ftui.states.lastSetOnline = ltime;
      // force shortpoll
      ftui.states.lastShortpoll = 0;
      ftui.startShortPollInterval(1000);
      if (!ftui.config.doLongPoll) {
        const longpoll = ftui.selectAll('meta[name="longpoll"]["content"]').content || '1';
        ftui.config.doLongPoll = (longpoll != '0');
        ftui.states.longPollRestart = false;
        if (ftui.config.doLongPoll) {
          ftui.startLongpoll();
        }
      }
      ftui.log(1, 'FTUI is online');
    }
  },

  setOffline: function () {
    if (ftui.config.DEBUG) ftui.toast('Lost connection to FHEM');
    ftui.config.doLongPoll = false;
    ftui.states.longPollRestart = true;
    clearInterval(ftui.poll.short.timer);
    ftui.stopLongpoll();
    ftui.log(1, 'FTUI is offline');
  },

  getDeviceParameter: function (devname, paraname) {
    if (devname && devname.length) {
      const params = ftui.deviceStates[devname];
      return (params && params[paraname]) ? params[paraname] : null;
    }
    return null;
  },

  dynamicload: function (url, async) {
    ftui.log(3, 'dynamic load file:' + url + ' / async:' + async);

    let deferred = ftui.deferred();
    let isAdded = false;

    // check if it is already included
    let i = ftui.scripts.length;
    while (i--) {
      if (ftui.scripts[i].url === url) {
        isAdded = true;
        break;
      }
    }

    if (!isAdded) {
      // not yet -> load
      if (url.match(new RegExp('^.*.(js)$'))) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = !!(async);
        script.src = url;
        script.onload = function () {
          ftui.log(3, 'dynamidynamic load done:' + url);
          deferred.resolve();
        };
        document.getElementsByTagName('head')[0].appendChild(script);
      } else {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = url;
        link.media = 'all';
        deferred.resolve();
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      const scriptObject = {};
      scriptObject.deferred = deferred;
      scriptObject.url = url;
      ftui.scripts.push(scriptObject);
    } else {
      // already loaded
      ftui.log(3, 'dynamic load not neccesary for:' + url);
      deferred = ftui.scripts[i].deferred;
    }

    return deferred.promise();
  },

  getCSrf: function () {

    return fetch(ftui.config.fhemDir + '?XHR=1', {
      cache: 'no-cache'
    })
      .then(response => {
        ftui.config.csrf = response.headers.get('X-FHEM-csrfToken');
        ftui.log(1, 'Got csrf from FHEM:' + ftui.config.csrf);
      });
  },

  healthCheck: function () {
    const timeDiff = new Date() - ftui.poll.long.lastEventTimestamp;
    if (timeDiff / 1000 > ftui.config.maxLongpollAge &&
      ftui.config.maxLongpollAge > 0 &&
      ftui.config.doLongPoll) {
      ftui.log(1, 'No longpoll event since ' + timeDiff / 1000 + 'secondes -> restart polling');
      ftui.setOnline();
      ftui.restartLongPoll();
    }
  },

  FS20: {
    'dimmerArray': [0, 6, 12, 18, 25, 31, 37, 43, 50, 56, 62, 68, 75, 81, 87, 93, 100],
    'dimmerValue': function (value) {
      const idx = ftui.indexOfNumeric(this.dimmerArray, value);
      return (idx > -1) ? this.dimmerArray[idx] : 0;
    }
  },

  rgbToHsl: function (rgb) {
    let r = parseInt(rgb.substring(0, 2), 16);
    let g = parseInt(rgb.substring(2, 4), 16);
    let b = parseInt(rgb.substring(4, 6), 16);
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);

    const min = Math.min(r, g, b);
    let h; let s; const l = (max + min) / 2;

    if (max == min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
      }
      h /= 6;
    }
    return [h, s, l];
  },

  hslToRgb: function (h, s, l) {
    let r, g, b;
    const hex = function (x) {
      return ('0' + parseInt(x).toString(16)).slice(-2);
    };

    let hue2rgb;
    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      hue2rgb = function (p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [hex(Math.round(r * 255)), hex(Math.round(g * 255)), hex(Math.round(b * 255))].join('');
  },

  rgbToHex: function (rgb) {
    const tokens = rgb.match(/^rgba?[\s+]?\([\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?/i);
    return (tokens && tokens.length === 4) ? '#' +
      ('0' + parseInt(tokens[1], 10).toString(16)).slice(-2) +
      ('0' + parseInt(tokens[2], 10).toString(16)).slice(-2) +
      ('0' + parseInt(tokens[3], 10).toString(16)).slice(-2) : rgb;
  },

  getGradientColor: function (start_color, end_color, percent) {
    // strip the leading # if it's there
    start_color = this.rgbToHex(start_color).replace(/^\s*#|\s*$/g, '');
    end_color = this.rgbToHex(end_color).replace(/^\s*#|\s*$/g, '');

    // convert 3 char codes --> 6, e.g. `E0F` --> `EE00FF`
    if (start_color.length == 3) {
      start_color = start_color.replace(/(.)/g, '$1$1');
    }

    if (end_color.length == 3) {
      end_color = end_color.replace(/(.)/g, '$1$1');
    }

    // get colors
    const start_red = parseInt(start_color.substr(0, 2), 16);

    const start_green = parseInt(start_color.substr(2, 2), 16);

    const start_blue = parseInt(start_color.substr(4, 2), 16);

    const end_red = parseInt(end_color.substr(0, 2), 16);

    const end_green = parseInt(end_color.substr(2, 2), 16);

    const end_blue = parseInt(end_color.substr(4, 2), 16);

    // calculate new color
    let diff_red = end_red - start_red;
    let diff_green = end_green - start_green;
    let diff_blue = end_blue - start_blue;

    diff_red = ((diff_red * percent) + start_red).toString(16).split('.')[0];
    diff_green = ((diff_green * percent) + start_green).toString(16).split('.')[0];
    diff_blue = ((diff_blue * percent) + start_blue).toString(16).split('.')[0];

    // ensure 2 digits by color
    if (diff_red.length == 1) { diff_red = '0' + diff_red; }

    if (diff_green.length == 1) { diff_green = '0' + diff_green; }

    if (diff_blue.length == 1) { diff_blue = '0' + diff_blue; }

    return '#' + diff_red + diff_green + diff_blue;
  },

  getPart: function (value, part) {
    if (ftui.isValid(part)) {
      if (ftui.isNumeric(part)) {
        const tokens = (ftui.isValid(value)) ? value.toString().split(' ') : '';
        return (tokens.length >= part && part > 0) ? tokens[part - 1] : value;
      } else {
        let ret = '';
        if (ftui.isValid(value)) {
          const matches = value.match(new RegExp('^' + part + '$'));
          if (matches) {
            for (let i = 1, len = matches.length; i < len; i++) {
              ret += matches[i];
            }
          }
        }
        return ret;
      }
    }
    return value;
  },

  showModal: function (modal) {
    const shade = document.getElementById('shade');
    if (modal) {
      shade.classList.remove('hidden');
    } else {
      shade.classList.add('hidden');
    }
  },

  precision: function (a) {
    const s = a + '';

    const d = s.indexOf('.') + 1;
    return !d ? 0 : s.length - d;
  },

  // 1. numeric, 2. regex, 3. negation double, 4. indexof
  indexOfGeneric: function (array, find) {
    if (!array) return -1;
    for (let i = 0, len = array.length; i < len; i++) {
      // leave the loop on first none numeric item
      if (!ftui.isNumeric(array[i])) { return ftui.indexOfRegex(array, find); }
    }
    return ftui.indexOfNumeric(array, find);
  },

  indexOfNumeric: function (array, val) {
    let ret = -1;
    for (let i = 0, len = array.length; i < len; i++) {
      if (Number(val) >= Number(array[i])) { ret = i; }
    }
    return ret;
  },

  indexOfRegex: function (array, find) {
    const len = array.length;
    for (let i = 0; i < len; i++) {
      try {
        const match = find.match(new RegExp('^' + array[i] + '$'));
        if (match) { return i; }
      } catch (e) {
        // Ignore
      }
    }

    // negation double
    if (len === 2 && array[0] === '!' + array[1] && find !== array[0]) {
      return 0;
    }
    if (len === 2 && array[1] === '!' + array[0] && find !== array[1]) {
      return 1;
    }

    // last chance: index of
    return array.indexOf(find);
  },

  isValid: function (v) {
    return (typeof v !== 'undefined');
  },

  // global date format functions
  dateFromString: function (str) {
    const m = str.match(/(\d+)-(\d+)-(\d+)[_\s](\d+):(\d+):(\d+).*/);
    const m2 = str.match(/^(\d+)$/);
    const m3 = str.match(/(\d\d).(\d\d).(\d\d\d\d)/);

    const offset = new Date().getTimezoneOffset();
    return (m) ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
      : (m2) ? new Date(70, 0, 1, 0, 0, m2[1], 0)
        : (m3) ? new Date(+m3[3], +m3[2] - 1, +m3[1], 0, -offset, 0, 0) : new Date();
  },

  diffMinutes: function (date1, date2) {
    const diff = new Date(date2 - date1);
    return (diff / 1000 / 60).toFixed(0);
  },

  diffSeconds: function (date1, date2) {
    const diff = new Date(date2 - date1);
    return (diff / 1000).toFixed(1);
  },

  durationFromSeconds: function (time) {
    const hrs = Math.floor(time / 3600);
    const mins = Math.floor((time % 3600) / 60);
    const secs = time % 60;
    let ret = '';
    if (hrs > 0) {
      ret += '' + hrs + ':' + (mins < 10 ? '0' : '');
    }
    ret += '' + mins + ':' + (secs < 10 ? '0' : '');
    ret += '' + secs;
    return ret;
  },

  mapColor: function (value) {
    return ftui.getStyle('.' + value, 'color') || value;
  },

  round: function (number, precision) {
    const shift = function (number, precision, reverseShift) {
      if (reverseShift) {
        precision = -precision;
      }
      const numArray = ('' + number).split('e');
      return +(numArray[0] + 'e' + (numArray[1] ? (+numArray[1] + precision) : precision));
    };
    return shift(Math.round(shift(number, precision, false)), precision, true);
  },

  parseJsonFromString: function (str) {
    return JSON.parse(str);
  },

  getAndroidVersion: function (ua) {
    ua = (ua || navigator.userAgent).toLowerCase();
    const match = ua.match(/android\s([0-9.]*)/);
    return match ? match[1] : false;
  },

  toast: function (text, error) {
    // https://github.com/MLaritz/Vanilla-Notify
    if (ftui.config.TOAST !== 0 && window.vNotify) {
      if (error && error === 'error') {
        return vNotify.error({
          text: text,
          visibleDuration: 20000, // in milli seconds
          position: ftui.config.toastPosition
        });
      } else if (error && error === 'info') {
        return vNotify.info({
          text: text,
          visibleDuration: 5000, // in milli seconds
          position: ftui.config.toastPosition
        });
      }
      else {
        return vNotify.notify({
          text: text,
          position: ftui.config.toastPosition
        });
      }
    }
  },

  log: function (level, text, error) {
    if (ftui.config.debuglevel >= level) {
      if (error) {
        // eslint-disable-next-line no-console
        console.error(text);
      } else {
        // eslint-disable-next-line no-console
        console.log(text);
      }
    }
  },

  selectElements(selector, context) {
    return (document).querySelector(context).querySelectorAll(selector);
  },

  selectAll: function (selector) {
    return document.querySelectorAll(selector);
  },

  selectOne: function (selector) {
    return document.querySelector(selector);
  },

  deferred: function () {
    const defer = {};
    const promise = new Promise((resolve, reject) => {
      defer.resolve = resolve;
      defer.reject = reject;
    });
    defer.promise = () => {
      return promise;
    };
    return defer;
  },

  getMetaNumber: function (key, defaultVal) {
    return Number.parseInt(ftui.getMetaString(key, defaultVal));
  },

  getMetaString: function (name, defaultVal) {
    if (ftui.config.meta[name]) {
      return ftui.config.meta[name].content;
    }
    return defaultVal;
  },

  appendStyleLink: function (file) {
    const newLink = document.createElement('link');
    newLink.href = file;
    newLink.setAttribute('rel', 'stylesheet');
    newLink.setAttribute('type', 'text/css');
    document.head.appendChild(newLink);
  },

  triggerEvent: function (eventName) {
    const event = new CustomEvent(eventName);
    document.dispatchEvent(event);
  },

  handleFetchErrors: function (response) {
    if (!response.ok) {
      throw Error(response.statusText);
    }
    return response;
  },

  parseArray: function (value) {
    if (typeof value === 'string') {
      value = ftui.parseJSON(!value.match(/^[[]/) ? '[' + value + ']' : value);
    }
    return value;
  },

  parseObject: function (value) {
    if (typeof value === 'string') {
      value = ftui.parseJSON(!value.match(/^{/) ? '{' + value + '}' : value);
    }
    return value;
  },

  parseJSON: function (json) {
    let parsed;
    if (json) {
      try {
        parsed = JSON.parse(json);
      } catch (e) {
        ftui.log(1, 'Error while parseJSON: ' + e, 'error');
      }
    }
    return parsed;
  },

  isNumeric: function (value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
  },

  matchingValue: function (mapAttribute, searchKey) {
    let matchValue = null;
    const map = ftui.parseObject(mapAttribute);
    Object.entries(map).forEach(([key, value]) => {
      if (searchKey === key ||
        parseFloat(searchKey) >= parseFloat(key) ||
        searchKey.match('^' + key + '$')) {
        matchValue = value;
      }
    });
    return matchValue;
  },

  // DOM functions

  getAllTagMatches: function (regEx) {
    return Array.prototype.slice.call(document.querySelectorAll('*')).filter(function (el) {
      return el.tagName.match(regEx);
    });
  }

};
// global helper functions

String.prototype.toDate = function () {
  return ftui.dateFromString(this);
};

String.prototype.parseJson = function () {
  return ftui.parseJsonFromString(this);
};

String.prototype.toMinFromMs = function () {
  let x = Number(this) / 1000;
  const ss = (Math.floor(x % 60)).toString();
  const mm = (Math.floor(x /= 60)).toString();
  return mm + ':' + (ss[1] ? ss : '0' + ss[0]);
};

String.prototype.toMinFromSec = function () {
  let x = Number(this);
  const ss = (Math.floor(x % 60)).toString();
  const mm = (Math.floor(x /= 60)).toString();
  return mm + ':' + (ss[1] ? ss : '0' + ss[0]);
};

String.prototype.toHoursFromMin = function () {
  const x = Number(this);
  const hh = (Math.floor(x / 60)).toString();
  const mm = (x - (hh * 60)).toString();
  return hh + ':' + (mm[1] ? mm : '0' + mm[0]);
};

String.prototype.toHoursFromSec = function () {
  const x = Number(this);
  const hh = (Math.floor(x / 3600)).toString();
  const ss = (Math.floor(x % 60)).toString();
  const mm = (Math.floor(x / 60) - (hh * 60)).toString();
  return hh + ':' + (mm[1] ? mm : '0' + mm[0]) + ':' + (ss[1] ? ss : '0' + ss[0]);
};

String.prototype.addFactor = function (factor) {
  const x = Number(this);
  return x * factor;
};

Date.prototype.addMinutes = function (minutes) {
  return new Date(this.getTime() + minutes * 60000);
};

Date.prototype.ago = function (format) {
  const now = new Date();
  const ms = (now - this);
  let x = ms / 1000;
  const seconds = Math.floor(x % 60);
  x /= 60;
  const minutes = Math.floor(x % 60);
  x /= 60;
  const hours = Math.floor(x % 24);
  x /= 24;
  const days = Math.floor(x);
  const strUnits = (ftui.config.lang === 'de') ? ['Tag(e)', 'Stunde(n)', 'Minute(n)', 'Sekunde(n)'] : ['day(s)', 'hour(s)', 'minute(s)',
    'second(s)'];
  let ret;
  if (ftui.isValid(format)) {
    ret = format.replace('dd', days);
    ret = ret.replace('hh', (hours > 9) ? hours : '0' + hours);
    ret = ret.replace('mm', (minutes > 9) ? minutes : '0' + minutes);
    ret = ret.replace('ss', (seconds > 9) ? seconds : '0' + seconds);
    ret = ret.replace('h', hours);
    ret = ret.replace('m', minutes);
    ret = ret.replace('s', seconds);
  } else {
    ret = (days > 0) ? days + ' ' + strUnits[0] + ' ' : '';
    ret += (hours > 0) ? hours + ' ' + strUnits[1] + ' ' : '';
    ret += (minutes > 0) ? minutes + ' ' + strUnits[2] + ' ' : '';
    ret += seconds + ' ' + strUnits[3];
  }
  return ret;
};

Date.prototype.format = function (format) {
  const YYYY = this.getFullYear().toString();
  const YY = this.getYear().toString();
  const MM = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  const dd = this.getDate().toString();
  const hh = this.getHours().toString();
  const mm = this.getMinutes().toString();
  const ss = this.getSeconds().toString();
  const eeee = this.eeee();
  const eee = this.eee();
  const ee = this.ee();
  let ret = format;
  ret = ret.replace('DD', (dd > 9) ? dd : '0' + dd);
  ret = ret.replace('D', dd);
  ret = ret.replace('MM', (MM > 9) ? MM : '0' + MM);
  ret = ret.replace('M', MM);
  ret = ret.replace('YYYY', YYYY);
  ret = ret.replace('YY', YY);
  ret = ret.replace('hh', (hh > 9) ? hh : '0' + hh);
  ret = ret.replace('mm', (mm > 9) ? mm : '0' + mm);
  ret = ret.replace('ss', (ss > 9) ? ss : '0' + ss);
  ret = ret.replace('h', hh);
  ret = ret.replace('m', mm);
  ret = ret.replace('s', ss);
  ret = ret.replace('eeee', eeee);
  ret = ret.replace('eee', eee);
  ret = ret.replace('ee', ee);

  return ret;
};

Date.prototype.yyyymmdd = function () {
  const yyyy = this.getFullYear().toString();
  const mm = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  const dd = this.getDate().toString();
  return yyyy + '-' + (mm[1] ? mm : '0' + mm[0]) + '-' + (dd[1] ? dd : '0' + dd[0]); // padding
};

Date.prototype.ddmmyyyy = function () {
  const yyyy = this.getFullYear().toString();
  const mm = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  const dd = this.getDate().toString();
  return (dd[1] ? dd : '0' + dd[0]) + '.' + (mm[1] ? mm : '0' + mm[0]) + '.' + yyyy; // padding
};

Date.prototype.hhmm = function () {
  const hh = this.getHours().toString();
  const mm = this.getMinutes().toString();
  return (hh[1] ? hh : '0' + hh[0]) + ':' + (mm[1] ? mm : '0' + mm[0]); // padding
};

Date.prototype.hhmmss = function () {
  const hh = this.getHours().toString();
  const mm = this.getMinutes().toString();
  const ss = this.getSeconds().toString();
  return (hh[1] ? hh : '0' + hh[0]) + ':' + (mm[1] ? mm : '0' + mm[0]) + ':' + (ss[1] ? ss : '0' + ss[0]); // padding
};

Date.prototype.ddmm = function () {
  const mm = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  const dd = this.getDate().toString();
  return (dd[1] ? dd : '0' + dd[0]) + '.' + (mm[1] ? mm : '0' + mm[0]) + '.'; // padding
};

Date.prototype.ddmmhhmm = function () {
  const MM = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  const dd = this.getDate().toString();
  const hh = this.getHours().toString();
  const mm = this.getMinutes().toString();
  return (dd[1] ? dd : '0' + dd[0]) + '.' + (MM[1] ? MM : '0' + MM[0]) + '. ' +
    (hh[1] ? hh : '0' + hh[0]) + ':' + (mm[1] ? mm : '0' + mm[0]);
};

Date.prototype.eeee = function () {
  const weekday_de = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (ftui.config.lang === 'de') { return weekday_de[this.getDay()]; }
  return weekday[this.getDay()];
};

Date.prototype.eee = function () {
  const weekday_de = ['Son', 'Mon', 'Die', 'Mit', 'Don', 'Fre', 'Sam'];
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (ftui.config.lang === 'de') { return weekday_de[this.getDay()]; }
  return weekday[this.getDay()];
};

Date.prototype.ee = function () {
  const weekday_de = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const weekday = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  if (ftui.config.lang === 'de') { return weekday_de[this.getDay()]; }
  return weekday[this.getDay()];
};


const menu = document.querySelector('#menu');
menu && menu.addEventListener('click', event => {
  event.target.classList.toggle('show');
});

window.addEventListener('beforeunload', () => {
  ftui.log(5, 'beforeunload');
  ftui.setOffline();
});

window.addEventListener('online offline', () => {
  ftui.log(5, 'online offline');
  if (navigator.onLine) { ftui.setOnline(); } else { ftui.setOffline(); }
});

window.onerror = function (msg, url, lineNo, columnNo, error) {
  const file = url.split('/').pop();
  ftui.toast([file + ':' + lineNo, error].join('<br/>'), 'error');
  return false;
};

ftui.init();
