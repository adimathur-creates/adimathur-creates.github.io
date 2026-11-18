"""Inline engine.js and program.js into index.src.html -> index.html (one self-contained file)."""
src = open('index.src.html').read()
for name in ['engine.js', 'program.js']:
    tag = f'<script src="{name}"></script>'
    assert tag in src, tag
    code = open(name).read().replace('</script', '<\\/script')
    src = src.replace(tag, f'<script>/* {name} (inlined) */\n{code}\n</script>')
open('index.html', 'w').write(src)
print('built index.html', len(src), 'bytes')
