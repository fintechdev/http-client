const EventEmitter = require('events').EventEmitter;
const trae         = require('trae');
const setTimeout   = require('relign/set-timeout');
const setInterval  = require('relign/set-interval');
const Storage      = require('@fintechdev/x2-service-storage');


class HTTP extends EventEmitter {
  constructor() {
    super();

    this._env = 'DEV';

    this.token           = null;
    this.tokenExpiriesAt = null;
    this._tokenDuration  = 1000 * 60 * 20; // 20 minutes

    this._storage                 = new Storage();
    this._inactivityCheckInterval = null;
    this._tokenRenewTimeout       = null;
    this._inactivityTimeout       = null;
    this._pageActivityDetected    = false;
    this._watchForPageActivity    = false;

    this.config  = {};
    this.session = {};

    this._restoreExistingSession();

    this.isAuthenticated = this.token !== null;

    this._initMiddlewares();
    this._initMethods();
  }

  init(opts = {}) {
    if (!opts.configPath) {
      trae.defaults({ baseUrl: 'http://localhost:8080' });
      return Promise.resolve();
    }

    return trae
      .get(opts.configPath, { bodyType: 'json' })
      .then((res) => {
        this.config = res.data;

        res.data.env           && (this._env = res.data.env);
        res.data.tokenDuration && (this._tokenDuration = res.data.tokenDuration);

        trae.defaults({
          baseUrl: res.data.api && res.data.api.url ? res.data.api.url : 'http://localhost:8080',
        });
      });
  }

  getEnvironment() {
    return this._env;
  }

  isProd() {
    return this._env === 'PROD';
  }

  login(params) {
    return trae
      .post('/token', params)
      .then((res) => {
        this.isAuthenticated = true;
        this.token           = res.data.token;
        this.tokenExpiriesAt = res.data.expiresAt;

        this._storage.set('token', res.data.token);
        this._storage.set('tokenExpiriesAt', res.data.expiresAt);

        if (this._watchForPageActivity) {
          this._startRenewTokenLoop();
        }
      });
  }

  getSession() {
    return trae
      .get('/user/current')
      .then((res) => {
        this.session = res.data;
        this._storage.set('session', res.data);

        return Promise.resolve(res);
      });
  }

  logout() {
    this.isAuthenticated = false;
    delete this.token;
    this._storage.remove('token');
    this._storage.remove('tokenExpiriesAt');

    this._stopRenewTokenLoop();
    return Promise.resolve();
  }

  sendPasswordReset(email, application) {
    return trae
      .post(`/user/send-password-reset/${email}`, { application })
      .then(res => res.data);
  }

  resetPassword(newPassword, passwordResetToken) {
    return trae
      .post(`/user/reset-password/${passwordResetToken}`, { newPassword })
      .then(res => res.data);
  }

  updatePassword(email, currentPassword, newPassword) {
    return trae
      .post(`/user/update-password/${email}`, { currentPassword, newPassword })
      .then(res => res.data);
  }

  watchForInactivity() {
    if (this._watchForPageActivity) { return; }
    window.addEventListener('keydown',   () => { this._pageActivityDetected = true; });
    window.addEventListener('mousemove', () => { this._pageActivityDetected = true; });
    this._watchForPageActivity = true;
  }

  _restoreExistingSession() {
    this.token = this._storage.get('token') || null;
  }

  _startRenewTokenLoop() {
    const startTokenRenewTimeout = () => {
      if (this._tokenRenewTimeout) {
        this._tokenRenewTimeout.clear && this._tokenRenewTimeout.clear();
        this._tokenRenewTimeout = null;
      }

      const renewTokenIn = (new Date(this.tokenExpiriesAt)).getTime() - Date.now();

      this._tokenRenewTimeout = setTimeout(() => trae
        .put('/token')
        .then((res) => {
          this.tokenExpiriesAt = res.data.expiresAt;
          this._storage.set('tokenExpiriesAt', res.data.expiresAt);
        }), renewTokenIn);
    };

    const startInactivityTimeout = () => {
      if (this._inactivityTimeout) {
        this._inactivityTimeout.clear && this._inactivityTimeout.clear();
        this._inactivityTimeout = null;
      }

      this._inactivityTimeout = setTimeout(() => {
        this
          .delete('/token')
          .then(() => this.emit('session-expired'));
      }, this._tokenDuration);
    };

    const inactivityCheck = () => {
      if (this._pageActivityDetected) {
        this._pageActivityDetected = false;
        return;
      }
      startInactivityTimeout();
    };

    this._inactivityCheckInterval = setInterval(inactivityCheck, 500);
    startTokenRenewTimeout();
  }

  _stopRenewTokenLoop() {
    if (this._tokenRenewTimeout) {
      this._tokenRenewTimeout.clear && this._tokenRenewTimeout.clear();
      this._tokenRenewTimeout = null;
    }
    if (this._inactivityTimeout) {
      this._inactivityTimeout.clear && this._inactivityTimeout.clear();
      this._inactivityTimeout = null;
    }
    if (this._inactivityCheckInterval) {
      this._inactivityCheckInterval.clear && this._inactivityCheckInterval.clear();
      this._inactivityCheckInterval = null;
    }
  }

  _initMethods() {
    ['get', 'post', 'put', 'delete'].forEach((method) => {
      this[method] = (...args) => trae[method](...args);
    });
  }

  _initMiddlewares() {
    trae.before((config) => {
      this.emit('before', config);
      if (this.isAuthenticated) {
        config.headers.authorization = this.token;
      }
      return config;
    });

    trae.after((res) => {
      this.emit('success', res);
      return Promise.resolve(res);
    }, (err) => {
      this.emit('error', err);
      return Promise.reject(err);
    });

    trae.finally(() => {
      this.emit('finally');
    });
  }
}

const http = new HTTP();
http.HTTP  = HTTP;
module.exports = http;
