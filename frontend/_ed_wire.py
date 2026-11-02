def edit(p, pairs):
    s = open(p).read()
    for a, b in pairs:
        assert a in s, (p, a[:70])
        s = s.replace(a, b, 1)
    open(p, 'w').write(s)

E = '/app/frontend/src/components/editor/'
edit(E + 'ImageEditor.js', [
("import { useCallback, useEffect, useRef, useState } from 'react';", "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';"),
("  const base = img ? rotated(img, rot, flipH, flipV) : null;", "  const base = useMemo(() => (img ? rotated(img, rot, flipH, flipV) : null), [img, rot, flipH, flipV]);"),
])
edit(E + 'TimelineEditor.js', [
("import { Loader2, Pause, Play, Plus, Scissors, Trash2, VolumeX, X } from 'lucide-react';", "import { Film, Loader2, Music, Pause, Play, Plus, Scissors, Trash2, VolumeX, X } from 'lucide-react';"),
("{library.map((a) => <SelectItem key={a.id} value={a.id}>{a.kind === 'video' ? '🎬 ' : '♪ '}{a.title}</SelectItem>)}",
 "{library.map((a) => <SelectItem key={a.id} value={a.id}><span className=\"inline-flex items-center gap-1.5\">{a.kind === 'video' ? <Film className=\"h-3.5 w-3.5\" /> : <Music className=\"h-3.5 w-3.5\" />}{a.title}</span></SelectItem>)}"),
])
F = '/app/frontend/src/pages/MediaLibraryPage.js'
edit(F, [
("import { MediaUsageBadge } from '../components/MediaUsageBadge';\n",
 "import { MediaUsageBadge } from '../components/MediaUsageBadge';\nimport { MediaEditorDialog, EDITABLE_KINDS } from '../components/editor/MediaEditorDialog';\nimport { Wand2 } from 'lucide-react';\n"),
("  const [uploadPhase, setUploadPhase] = useState('');\n", "  const [uploadPhase, setUploadPhase] = useState('');\n  const [editorAsset, setEditorAsset] = useState(null);\n"),
('''                        {canEdit && (
                          <>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAsset(asset);''', '''                        {EDITABLE_KINDS.includes(asset.kind) && (
                          <DropdownMenuItem
                            data-testid={`edit-media-${asset.id}`}
                            onClick={(e) => { e.stopPropagation(); setEditorAsset(asset); }}
                            className="text-zinc-600"
                          >
                            <Wand2 className="w-4 h-4 mr-2" />
                            Edit {asset.kind}
                          </DropdownMenuItem>
                        )}
                        {canEdit && (
                          <>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAsset(asset);'''),
])
s = open(F).read()
i = s.rindex('    </div>\n  );\n}\n\n// Droppable')
s = s[:i] + '      <MediaEditorDialog asset={editorAsset} onClose={() => setEditorAsset(null)} onSaved={fetchAssets} />\n' + s[i:]
open(F, 'w').write(s)

B = '/app/backend/routers/media_editor.py'
edit(B, [
('''        okey_ext = key.rsplit(".", 1)[-1].lower()
        if okey_ext in ("jpg", "jpeg") and mime != "image/jpeg" or okey_ext in ("png", "webp") and ext != okey_ext:''',
 '''        okey_ext = key.rsplit(".", 1)[-1].lower()
        if okey_ext not in ("jpg", "jpeg", "png", "webp") or (okey_ext in ("jpg", "jpeg")) != (mime == "image/jpeg") \\
                or (okey_ext in ("png", "webp") and ext != okey_ext):'''),
])
print('ok')
