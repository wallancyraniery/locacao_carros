#!/usr/bin/env python3
"""Isolated real Storage HTTP regression; Docker + Python standard library only.
Runs the working-tree migrations on a new disposable database. Never reads .env.
All credentials are generated, local, ephemeral; no token is printed or saved.
"""
import base64
import hashlib
import hmac
import json
import pathlib
import secrets
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
IMAGE = 'supabase/storage-api@sha256:f90502dcb5c2fe016a2994ea29485bbd9fd800822c18a7bdc00ddf2de6fdf19a'
NAME = 'media-http-' + uuid.uuid4().hex[:10]
SECRET = secrets.token_urlsafe(48)
PASSWORD = secrets.token_urlsafe(32)
BASE = ''


def docker(*args, **kwargs):
    return subprocess.run(['docker', *args], check=True, capture_output=True, text=True, **kwargs).stdout.strip()


def sql(statement):
    return docker('exec', '-i', NAME + '-db', 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', input=statement).splitlines()[-1]


def jwt(role, subject=None):
    def enc(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    payload = enc({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + enc({
        'role': role, 'sub': subject or str(uuid.uuid4()), 'is_anonymous': False,
        'iat': int(time.time()), 'exp': int(time.time()) + 3600,
    })
    return (payload + b'.' + base64.urlsafe_b64encode(hmac.new(SECRET.encode(), payload, hashlib.sha256).digest()).rstrip(b'=')).decode()


def request(method, path, token=None, data=None, headers=None):
    merged = dict(headers or {})
    if token:
        merged['Authorization'] = 'Bearer ' + token
    if isinstance(data, dict):
        data = json.dumps(data).encode()
        merged['Content-Type'] = 'application/json'
    req = urllib.request.Request(BASE + path, data=data, headers=merged, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def check(label, result, expected, error=None):
    status, body = result
    safe = {'scenario': label, 'http': status}
    if isinstance(body, dict):
        safe.update({key: body[key] for key in ('error', 'statusCode', 'message') if key in body})
    print(json.dumps(safe), flush=True)
    assert status == expected, label
    if error:
        assert body.get('error') == error, label


def run():
    global BASE
    docker('network', 'create', NAME)
    docker('run', '-d', '--name', NAME + '-db', '--network', NAME,
           '-e', 'POSTGRES_PASSWORD=' + PASSWORD, 'postgres:17-alpine')
    for attempt in range(60):
        try:
            docker('exec', NAME + '-db', 'pg_isready', '-U', 'postgres')
            break
        except subprocess.CalledProcessError:
            time.sleep(1)
    docker('run', '-d', '--name', NAME + '-api', '--network', NAME,
           '-p', '127.0.0.1::5000', '-e', 'AUTH_JWT_SECRET=' + SECRET,
           '-e', 'AUTH_JWT_ALGORITHM=HS256', '-e', 'DATABASE_URL=postgres://postgres:' + PASSWORD + '@' + NAME + '-db:5432/postgres',
           '-e', 'DB_INSTALL_ROLES=true', '-e', 'STORAGE_BACKEND=file',
           '-e', 'FILE_STORAGE_BACKEND_PATH=/var/lib/storage', '-e', 'FILE_SIZE_LIMIT=5242880',
           '-e', 'GLOBAL_S3_BUCKET=local-media', '-e', 'REGION=local', '-e', 'TENANT_ID=local', IMAGE)
    BASE = 'http://' + docker('port', NAME + '-api', '5000/tcp')
    for attempt in range(60):
        try:
            with urllib.request.urlopen(BASE + '/status', timeout=2):
                break
        except (urllib.error.URLError, OSError):
            time.sleep(1)
    for migration in sorted((ROOT / 'drizzle').glob('*.sql')):
        sql(migration.read_text())
    owner, org, vehicle = (str(uuid.uuid4()) for _ in range(3))
    sql(f"""insert into organizations(id,name,slug,storefront_status) values('{org}','Synthetic HTTP','http-{org}','published');
    insert into organization_memberships(user_id,organization_id,role) values('{owner}','{org}','owner');
    insert into vehicles(id,organization_id,brand,model,year,color,weekly_price_cents,status,operational_status,is_demo)
    values('{vehicle}','{org}','Synthetic','HTTP',2025,'Blue',100,'available','active',false);""")
    user, service = jwt('authenticated', owner), jwt('service_role')
    check('private.bucket', request('POST', '/bucket', service, {
        'id': 'vehicle-media', 'name': 'vehicle-media', 'public': False,
        'file_size_limit': 5242880, 'allowed_mime_types': ['image/png', 'image/jpeg', 'image/webp'],
    }), 200)
    claims = json.dumps({'sub': owner})
    sql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{claims}',true);select public.prepare_vehicle_media('{vehicle}','{uuid.uuid4()}','image/png',68);commit;")
    path = sql(f"select storage_path from vehicle_images where vehicle_id='{vehicle}'")
    image_id = sql(f"select id from vehicle_images where vehicle_id='{vehicle}'")

    def sign(token, upsert):
        return request('POST', '/object/upload/sign/vehicle-media/' + path, token, {}, {'x-upsert': str(upsert).lower()})

    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=')

    def upload(url, upsert=False):
        return request('PUT', url, data=png, headers={'Content-Type': 'image/png', 'x-upsert': str(upsert).lower()})

    check('D.user.sign.false.before', sign(user, False), 400, 'Unauthorized')
    check('D.user.sign.true.before', sign(user, True), 400, 'Unauthorized')
    signed = sign(service, False)
    check('A.server.sign.false', signed, 200)
    url = signed[1]['url']
    check('A.first.upload', upload(url), 200)
    check('B.overwrite', upload(url), 400, 'Duplicate')
    check('C.hostile.x-upsert', upload(url, True), 400, 'Duplicate')
    check('D.user.sign.true.after', sign(user, True), 400, 'Unauthorized')
    check('E.changed.path', upload(url.replace(path, path + '-changed')), 400, 'InvalidSignature')
    sql(f"begin;set local role authenticated;select set_config('request.jwt.claims','{claims}',true);select public.delete_vehicle_media('{vehicle}','{image_id}');commit;")
    removed = request('DELETE', '/object/vehicle-media', service, {'prefixes': [path]})
    check('cleanup.existing', removed, 200)
    assert len(removed[1]) == 1
    absent = request('DELETE', '/object/vehicle-media', service, {'prefixes': [path]})
    check('cleanup.absent.retry', absent, 200)
    assert absent[1] == []
    # Signed capabilities remain valid until expiry even after physical removal.
    # Record this residual explicitly: lifecycle must schedule subsequent cleanup.
    check('residual.late.replay.after.remove', upload(url), 200)
    check('residual.cleanup', request('DELETE', '/object/vehicle-media', service, {'prefixes': [path]}), 200)
    print('PASS: real local Storage HTTP A/B/C/D/E and existing/absent cleanup', flush=True)


if __name__ == '__main__':
    try:
        run()
    except subprocess.CalledProcessError:
        raise SystemExit('Local Docker/SQL setup failed; inspect only the isolated resources. No credentials printed.') from None
    finally:
        for suffix in ('-api', '-db'):
            subprocess.run(['docker', 'rm', '-f', NAME + suffix], capture_output=True)
        subprocess.run(['docker', 'network', 'rm', NAME], capture_output=True)
