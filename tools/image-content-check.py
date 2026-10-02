import io, json, pathlib, sys, tarfile

archive=pathlib.Path(sys.argv[1])
credentials=json.loads(pathlib.Path(sys.argv[2]).read_text(encoding='utf-8-sig'))
token=pathlib.Path(sys.argv[3]).read_text().strip()
secrets=[v.encode() for k,v in credentials.items() if any(s in k.lower() for s in ['token','password','key'])]+[token.encode()]
allowed={'app/package.json','app/server/index.js','app/server/store.js','app/server/auth.js','app/server/undo.js'}
app_files=set();file_count=0
with tarfile.open(archive) as outer:
 manifest=json.load(outer.extractfile('manifest.json'))
 config=json.load(outer.extractfile(manifest[0]['Config']))
 assert config['config']['User']=='node'
 assert not any(secret in json.dumps(config).encode() for secret in secrets),'Credential detected in image config'
 for layer in manifest[0]['Layers']:
  layer_data=outer.extractfile(layer).read()
  assert not any(secret in layer_data for secret in secrets),'Credential detected in image layer'
  with tarfile.open(fileobj=io.BytesIO(layer_data)) as inner:
   for entry in inner:
    name=entry.name.removeprefix('./').lstrip('/')
    assert pathlib.PurePosixPath(name).name not in ['AGENTS.md','CLAUDE.md','.env','credentials.json'],'Unexpected sensitive file in layer'
    if entry.isfile():
     file_count+=1
     assert not any(secret in inner.extractfile(entry).read() for secret in secrets),'Credential detected in file content'
     assert not name.startswith('data/'),'Operational data detected'
     if name.startswith('app/'):
      assert name in allowed,'Unexpected application file'
      app_files.add(name)
 assert app_files==allowed,'Missing expected application file'
print('Todas as camadas conferidas; sem credenciais conhecidas, .env, instrucoes privadas ou banco')
print('Arquivos da aplicacao:',', '.join(sorted(app_files)))
