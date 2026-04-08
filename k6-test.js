import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:4400';

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};


const TEST_USER = {
  username: 'Kastilo',
  passwordHash: 'salm894k',
};


export function setup() {
  const jar = http.cookieJar();

  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify(TEST_USER),
    {
      headers: { 'Content-Type': 'application/json' },
      redirects: 0,
    }
  );

  const ok = check(loginRes, {
    'login: статус 200 или 201': (r) => r.status === 200 || r.status === 201,
  });

  if (!ok) {
    console.error('Ответ сервера:', loginRes.status, loginRes.body);
    throw new Error('Не удалось залогиниться — проверь логин/пароль и что сервер запущен');
  }

  const cookies = loginRes.cookies;
  const accessToken  = cookies['access_token']  ? cookies['access_token'][0].value  : null;
  const refreshToken = cookies['refresh_token'] ? cookies['refresh_token'][0].value : null;

  if (!accessToken) {
    console.error('Куки в ответе:', JSON.stringify(cookies));
    throw new Error('access_token не получен — проверь что сервер ставит куку');
  }

  console.log('Логин успешен, куки получены');
  return { accessToken, refreshToken };
}

export default function (data) {
  const params = {
    headers: { 'Content-Type': 'application/json' },
    cookies: {
      access_token:  data.accessToken,
      refresh_token: data.refreshToken,
    },
  };

  const profileRes = http.get(`${BASE_URL}/user/profile`, params);
  check(profileRes, {
    'profile: статус 200':    (r) => r.status === 200,
    'profile: есть username': (r) => JSON.parse(r.body).username !== undefined,
  });

  sleep(0.5);

  const columnsRes = http.get(`${BASE_URL}/infinity-life/columns`, params);
  check(columnsRes, {
    'columns: статус 200':  (r) => r.status === 200,
    'columns: это массив':  (r) => Array.isArray(JSON.parse(r.body)),
  });

  sleep(0.5);


  const filesRes = http.get(`${BASE_URL}/file-system/files`, params);
  check(filesRes, {
    'files: статус 200': (r) => r.status === 200,
  });

  sleep(0.5);

  const treeRes = http.get(`${BASE_URL}/file-system/tree`, params);
  check(treeRes, {
    'tree: статус 200': (r) => r.status === 200,
  });

  sleep(0.5);

  const createTaskRes = http.post(
    `${BASE_URL}/infinity-life/tasks`,
    JSON.stringify({ title: 'k6 тест задача', priority: 'LOW' }),
    params
  );
  check(createTaskRes, {
    'create task: статус 200 или 201': (r) => r.status === 200 || r.status === 201,
  });

  if (createTaskRes.status === 200 || createTaskRes.status === 201) {
    const taskId = JSON.parse(createTaskRes.body).id;
    if (taskId) {
      const deleteRes = http.del(
        `${BASE_URL}/infinity-life/tasks/${taskId}`,
        null,
        params
      );
      check(deleteRes, {
        'delete task: статус 200': (r) => r.status === 200,
      });
    }
  }

  sleep(1);
}

export function teardown(data) {
  const params = {
    headers: { 'Content-Type': 'application/json' },
    cookies: {
      access_token:  data.accessToken,
      refresh_token: data.refreshToken,
    },
  };

  http.post(`${BASE_URL}/auth/logout`, null, params);
  console.log('Тест завершён, выход выполнен');
}