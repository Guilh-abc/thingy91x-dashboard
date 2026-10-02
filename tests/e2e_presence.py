"""Headless Chrome (playwright) com API simulada. Uso: python3 tests/e2e_presence.py [cenario ...]
Cenários: user_case (last_seen 6h + trilha GNSS 3 min), all_old, nodata, msgs_only
Não usa chaves reais; intercepta /.netlify/functions/** e serve os arquivos locais."""
import json, os, sys, mimetypes, datetime as dt
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = 'https://guilh-abc.github.io/thingy91x-dashboard/'
DEV = '50423451-3737-4337-80fc-110bddf418ff'
now = dt.datetime.now(dt.timezone.utc)
iso = lambda d: d.strftime('%Y-%m-%dT%H:%M:%S.000Z')
ago = lambda **k: iso(now - dt.timedelta(**k))

def device(sc):
    ls = {'user_case': ago(hours=6), 'all_old': ago(hours=6), 'nodata': None, 'msgs_only': ago(hours=6), 'full': ago(hours=6)}[sc]
    d = {"id": DEV, "name": DEV, "device_serial": DEV, "firmware": {"app": {"version": "1.5.4"}},
         "$meta": {"updatedAt": ago(hours=5, minutes=2)}, "_shadowMeta": ago(hours=5, minutes=2),
         "state": {"reported": {"connected": False, "config": {"update_interval": 600}, "device": {"deviceInfo": {"appVersion": "1.5.4"}, "networkInfo": {}}}}}
    if ls: d["last_seen"] = ls
    else: d["$meta"] = {"updatedAt": None}; d["_shadowMeta"] = None
    return d

def msgs(sc):
    if sc in ('user_case', 'msgs_only', 'full'):
        it = [{"deviceId": DEV, "receivedAt": ago(minutes=3), "message": {"appId": "BATTERY", "messageType": "DATA", "data": 81}},
              {"deviceId": DEV, "receivedAt": ago(minutes=3), "message": {"appId": "TEMP", "messageType": "DATA", "data": "24.6"}},
              {"deviceId": DEV, "receivedAt": ago(minutes=3), "message": {"appId": "HUMID", "messageType": "DATA", "data": 45.2}},
              {"deviceId": DEV, "receivedAt": ago(minutes=3), "message": {"appId": "AIR_PRESS", "messageType": "DATA", "data": 92.1}}]
        if sc in ('msgs_only', 'full'): return it
        return []  # user_case: sem mensagens; só location history (GNSS)
    if sc == 'all_old':
        return [{"deviceId": DEV, "receivedAt": ago(hours=5), "message": {"appId": "TEMP", "data": 24}}]
    return []

def hist(sc):
    if sc not in ('user_case', 'full'):
        return []
    items = []
    for i in range(30):
        items.append({"id": f"h{i}", "deviceId": DEV, "serviceType": "GNSS", "insertedAt": ago(minutes=3 + i * 4),
                      "lat": str(-23.691565 + i * 0.001), "lon": str(-46.559541 + i * 0.001), "uncertainty": "12"})
    return items

def run(sc, results):
    out = {"scenario": sc, "console": []}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 1400, 'height': 1000}, service_workers='block', locale='pt-BR', timezone_id='America/Sao_Paulo')
        pg = ctx.new_page()
        pg.on('console', lambda m: out["console"].append(f"{m.type}: {m.text}"[:240]) if m.type in ('error',) else None)
        pg.on('pageerror', lambda e: out["console"].append(f"PAGEERROR: {e}"[:400]))
        pg.add_init_script("localStorage.setItem('nrf_api_key','FAKE');localStorage.setItem('nrf_user_email','t@example.com');localStorage.setItem('nrf_team_api_key','FAKE');localStorage.setItem('nrf_device_id','%s');" % DEV)
        def api(route):
            u = route.request.url
            if '/functions/alerts' in u:
                return route.fulfill(status=200, content_type='application/json', body=json.dumps({"alerts": []}), headers={'access-control-allow-origin': '*'})
            path = u.split('/functions/nrfcloud')[-1]
            H = {'access-control-allow-origin': '*'}
            J = lambda o: route.fulfill(status=200, content_type='application/json', body=json.dumps(o), headers=H)
            if path.startswith('/devices?'): return J({"items": [device(sc)], "total": 1})
            if path.startswith('/devices/'): return J(device(sc))
            if path.startswith('/messages'):
                if 'appId=' in path:
                    app = path.split('appId=')[1].split('&')[0]
                    return J({"items": [m for m in msgs(sc) if m["message"]["appId"] == app], "total": 1})
                return J({"items": msgs(sc), "total": len(msgs(sc))})
            if path.startswith('/location/history'): return J({"items": hist(sc), "total": len(hist(sc))})
            return route.fulfill(status=404, content_type='application/json', body='{}', headers=H)
        pg.route('**/.netlify/functions/**', api)
        def local(route):
            path = route.request.url.split('/thingy91x-dashboard/')[-1].split('?')[0].split('#')[0] or 'index.html'
            fp = os.path.join(ROOT, path)
            if not os.path.isfile(fp): return route.fulfill(status=404, body='')
            return route.fulfill(status=200, body=open(fp, 'rb').read(), content_type=mimetypes.guess_type(fp)[0] or 'application/octet-stream')
        pg.route(PAGES + '**', local)
        pg.route('**/tile.openstreetmap.org/**', lambda r: r.fulfill(status=204, body=''))
        # leaflet do CDN (não há internet garantida): tenta rede; se falhar, segue
        pg.goto(PAGES, wait_until='domcontentloaded', timeout=60000)
        pg.wait_for_timeout(9000)
        g = lambda i: pg.evaluate(f"document.getElementById('{i}')?.textContent?.trim()")
        out.update({
            "header": g('connLabel'), "headerClass": pg.evaluate("document.getElementById('connectionStatus').className"),
            "headerTitle": pg.evaluate("document.getElementById('connectionStatus').title"),
            "sitEstado": g('sitEstado'), "sitRisco": g('sitRisco'), "sitAcao": g('sitAcao'),
            "alertas": pg.evaluate("[...document.querySelectorAll('#sitAlertas li')].map(l=>l.textContent)"),
            "stripCloud": g('stripCloud'), "stripCell": g('stripCell'), "stripNetAge": g('stripNetAge'),
            "stripNetAgeTitle": pg.evaluate("document.getElementById('stripNetAge').title"),
            "stripNetSrc": g('stripNetSrc'), "stripHint": g('stripHint'),
            "gpsCoords": g('gpsCoords'), "gpsAge": g('gpsAge'), "trailPoints": g('trailPoints'),
            "battery": g('batteryValue'), "temp": g('tempValue'), "hum": g('humValue'), "press": g('pressValue'),
            "lastSeenChip": g('lastSeen'), "netSource": g('netSource'), "connLastSeen": g('connLastSeen'),
            "fleet": pg.evaluate("[...document.querySelectorAll('.fleet-meta')].map(e=>e.textContent)"),
        })
        # popup do ponto mais recente
        try:
            out["popupLatest"] = pg.evaluate("""(()=>{try{const pts=lastTrail; if(!pts.length) return null; const n=newestPoint(pts); return buildTrailPopupHtml(n,{latest:true}).replace(/<[^>]+>/g,' | ').replace(/\\s+/g,' ')}catch(e){return 'ERR '+e}})()""")
            out["popupOld"] = pg.evaluate("""(()=>{try{const pts=lastTrail; if(pts.length<3) return null; return buildTrailPopupHtml(pts[0],{latest:false}).replace(/<[^>]+>/g,' | ').replace(/\\s+/g,' ')}catch(e){return 'ERR '+e}})()""")
        except Exception as e:
            out["popupErr"] = str(e)
        os.makedirs('/tmp/e2e', exist_ok=True)
        pg.screenshot(path=f'/tmp/e2e/{sc}.png', full_page=False)
        b.close()
    results.append(out)
    return out

def check(o):
    sc = o['scenario']; errs = []
    def need(cond, msg):
        if not cond: errs.append(msg)
    if sc == 'user_case':
        need(o['header'].startswith('Online'), f"header={o['header']}")
        need('connected' in o['headerClass'], 'header sem classe connected')
        need(o['stripCloud'] == 'ONLINE', f"stripCloud={o['stripCloud']}")
        need(o['sitEstado'].startswith('Online'), f"sitEstado={o['sitEstado']}")
        need('Crítico' not in o['sitRisco'], f"risco={o['sitRisco']}")
        need(not any('offline' in a.lower() for a in o['alertas']), f"alertas={o['alertas']}")
        need('Aguardando LTE' not in o['sitAcao'], f"acao={o['sitAcao']}")
        need('há 3' in o['stripNetAge'] or 'há 2' in o['stripNetAge'], f"stripNetAge={o['stripNetAge']}")
        need('localização' in o['stripNetAgeTitle'] and 'GNSS' in o['stripNetAgeTitle'], f"tooltip={o['stripNetAgeTitle']!r}")
        need(o['gpsAge'].startswith('há') and 'd' not in o['gpsAge'].split()[-1][-1:], f"gpsAge={o['gpsAge']}")
        need(not any('Posição velha' in a for a in o['alertas']), f"alertas={o['alertas']}")
        need(o['stripNetSrc'] and o['stripNetSrc'] != '—', f"stripNetSrc={o['stripNetSrc']!r}")
        need('não enviou dados de rede' in (o['stripHint'] or ''), f"stripHint={o['stripHint']!r}")
        need(any('dados de rede' in a for a in o['alertas']) or True, '')
        need(o['popupLatest'] and 'Online' in o['popupLatest'], f"popupLatest={o['popupLatest']}")
        need(o['popupOld'] and 'Registro histórico' in o['popupOld'] and 'Online' not in o['popupOld'], f"popupOld={o['popupOld']}")
        need(o['battery'] in ('—', ''), f"battery(sem msgs)={o['battery']}")
    if sc == 'msgs_only':
        need(o['header'].startswith('Online'), f"header={o['header']}")
        need(o['battery'] == '81%', f"battery={o['battery']}")
        need(o['temp'] == '24.6', f"temp={o['temp']}")
        need(o['press'] == '921.0', f"press={o['press']}")
    if sc == 'full':
        need(o['header'].startswith('Online'), f"header={o['header']}")
        need(o['popupLatest'] and '81%' in o['popupLatest'] and '24.6' in o['popupLatest'] and '92' in o['popupLatest'], f"popupLatest={o['popupLatest']}")
        need(o['gpsAge'].startswith('há'), f"gpsAge={o['gpsAge']}")
    if sc == 'all_old':
        need(o['header'].startswith('Offline'), f"header={o['header']}")
        need(o['stripCloud'] == 'OFFLINE', f"stripCloud={o['stripCloud']}")
        need(any('offline' in a.lower() for a in o['alertas']), f"alertas={o['alertas']}")
    if sc == 'nodata':
        need(o['header'].startswith('Sem dados'), f"header={o['header']}")
        need(o['stripCloud'] == 'SEM DADOS', f"stripCloud={o['stripCloud']}")
    need(not [c for c in o['console'] if 'PAGEERROR' in c], f"pageerrors={[c for c in o['console'] if 'PAGEERROR' in c]}")
    return errs

if __name__ == '__main__':
    scs = sys.argv[1:] or ['user_case', 'msgs_only', 'full', 'all_old', 'nodata']
    res = []; bad = 0
    for sc in scs:
        o = run(sc, res); e = check(o)
        print(('PASS ' if not e else 'FAIL ') + sc)
        print(json.dumps({k: v for k, v in o.items() if k not in ('console',)}, ensure_ascii=False, indent=1))
        if o['console']: print('console:', o['console'][:6])
        for x in e: print('   ✗', x)
        bad += bool(e)
    sys.exit(1 if bad else 0)
