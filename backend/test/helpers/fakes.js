// Express 없이 미들웨어를 단위 테스트하기 위한 최소한의 req/res 대역

export function fakeReq({ method = 'GET', path = '/', headers = {}, ...rest } = {}) {
  return { method, path, headers, ...rest };
}

export function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    set(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
  };
}

/** next()가 받은 인자를 기록한다. */
export function spyNext() {
  const next = (arg) => {
    next.calls.push(arg);
  };
  next.calls = [];
  return next;
}
