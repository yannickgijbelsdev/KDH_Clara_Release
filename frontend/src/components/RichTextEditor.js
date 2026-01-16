import { useRef } from 'react';
import { Editor } from '@tinymce/tinymce-react';

/**
 * Rich Text Editor component using TinyMCE (self-hosted)
 * Full toolbar with all formatting options
 */
const RichTextEditor = ({ 
  value, 
  onChange, 
  placeholder = 'Start writing...',
  height = 400,
  disabled = false,
  id = 'rich-text-editor'
}) => {
  const editorRef = useRef(null);

  const handleEditorChange = (content) => {
    onChange(content);
  };

  return (
    <div className="rich-text-editor-wrapper">
      <Editor
        id={id}
        tinymceScriptSrc="/tinymce/tinymce.min.js"
        onInit={(evt, editor) => editorRef.current = editor}
        value={value}
        onEditorChange={handleEditorChange}
        disabled={disabled}
        init={{
          height,
          menubar: true,
          placeholder,
          plugins: [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
            'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
            'insertdatetime', 'media', 'table', 'help', 'wordcount',
            'emoticons', 'codesample', 'quickbars', 'directionality'
          ],
          toolbar: 
            'undo redo | blocks fontfamily fontsize | ' +
            'bold italic underline strikethrough | forecolor backcolor | ' +
            'alignleft aligncenter alignright alignjustify | ' +
            'bullist numlist outdent indent | ' +
            'link image media table | ' +
            'blockquote codesample emoticons charmap | ' +
            'removeformat | fullscreen preview code help',
          toolbar_mode: 'sliding',
          quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote',
          quickbars_insert_toolbar: 'quickimage quicktable',
          contextmenu: 'link image table',
          content_style: `
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              font-size: 14px;
              color: #e4e4e7;
              background-color: #27272a;
              padding: 12px;
              line-height: 1.6;
            }
            p { margin: 0 0 1em 0; }
            a { color: #a78bfa; }
            h1, h2, h3, h4, h5, h6 { color: #ffffff; margin-top: 1.5em; margin-bottom: 0.5em; }
            pre { background-color: #18181b; padding: 1em; border-radius: 6px; overflow-x: auto; }
            code { background-color: #18181b; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
            blockquote { border-left: 3px solid #a78bfa; margin-left: 0; padding-left: 1em; color: #a1a1aa; }
            table { border-collapse: collapse; width: 100%; }
            table td, table th { border: 1px solid #3f3f46; padding: 8px; }
            table th { background-color: #18181b; }
            img { max-width: 100%; height: auto; }
          `,
          skin: 'oxide-dark',
          content_css: 'dark',
          branding: false,
          promotion: false,
          resize: true,
          statusbar: true,
          elementpath: false,
          paste_data_images: true,
          automatic_uploads: false,
          images_upload_handler: (blobInfo, progress) => new Promise((resolve, reject) => {
            // For now, convert to base64 - can be enhanced to upload to server
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject('Failed to read file');
            reader.readAsDataURL(blobInfo.blob());
          }),
          setup: (editor) => {
            editor.on('init', () => {
              // Apply dark theme to editor container
              const container = editor.getContainer();
              if (container) {
                container.style.borderRadius = '8px';
                container.style.border = '1px solid #3f3f46';
                container.style.overflow = 'hidden';
              }
            });
          }
        }}
      />
      <style>{`
        .rich-text-editor-wrapper .tox-tinymce {
          border-radius: 8px !important;
          border: 1px solid #3f3f46 !important;
        }
        .rich-text-editor-wrapper .tox .tox-edit-area::before {
          border: none !important;
        }
        .rich-text-editor-wrapper .tox .tox-toolbar__primary {
          background-color: #18181b !important;
          border-bottom: 1px solid #3f3f46 !important;
        }
        .rich-text-editor-wrapper .tox .tox-menubar {
          background-color: #18181b !important;
          border-bottom: 1px solid #3f3f46 !important;
        }
        .rich-text-editor-wrapper .tox .tox-statusbar {
          background-color: #18181b !important;
          border-top: 1px solid #3f3f46 !important;
          color: #71717a !important;
        }
        .rich-text-editor-wrapper .tox .tox-statusbar__text-container {
          color: #71717a !important;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
