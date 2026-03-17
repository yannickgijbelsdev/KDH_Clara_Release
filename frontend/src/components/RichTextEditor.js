import { useRef, useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import axios from 'axios';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Rich Text Editor component using TinyMCE (self-hosted)
 * Full toolbar with file uploads and link insertion
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleEditorChange = (content) => {
    onChange(content);
  };

  // File upload handler for images
  const handleImageUpload = (blobInfo, progress) => new Promise(async (resolve, reject) => {
    try {
      setIsUploading(true);
      setUploadFileName(blobInfo.filename());
      setUploadProgress(0);
      setUploadError(null);
      
      const formData = new FormData();
      formData.append('file', blobInfo.blob(), blobInfo.filename());
      
      const response = await axios.post(`${API}/uploads/editor-files`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000, // 5 minute timeout
          onUploadProgress: (e) => {
            if (e.total) {
              const percent = Math.round((e.loaded / e.total) * 100);
              setUploadProgress(percent);
              progress(percent);
            }
          }
        });
      
      setIsUploading(false);
      setUploadProgress(0);
      
      if (response.data && response.data.url) {
        resolve(response.data.url);
      } else {
        // Fallback to base64 if server upload fails
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject('Failed to read file');
        reader.readAsDataURL(blobInfo.blob());
      }
    } catch (error) {
      setIsUploading(false);
      setUploadProgress(0);
      const errorMsg = error.response?.data?.detail || error.message || 'Upload failed';
      setUploadError(`Image upload failed: ${errorMsg}`);
      setTimeout(() => setUploadError(null), 5000);
      // Fallback to base64 encoding
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject('Failed to read file');
      reader.readAsDataURL(blobInfo.blob());
    }
  });

  // File picker callback for inserting files/images
  const handleFilePicker = (callback, value, meta) => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    
    if (meta.filetype === 'image') {
      // Accept all common image formats
      input.setAttribute('accept', 'image/*,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.svg');
    } else if (meta.filetype === 'media') {
      // Accept video and audio
      input.setAttribute('accept', 'video/*,audio/*,.mp4,.mov,.webm,.avi,.mp3,.wav,.m4a,.ogg');
    } else {
      input.setAttribute('accept', '*/*');
    }

    input.onchange = async function() {
      const file = this.files[0];
      if (!file) return;

      try {
        setIsUploading(true);
        setUploadFileName(file.name);
        setUploadProgress(0);
        setUploadError(null);
        
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await axios.post(`${API}/uploads/editor-files`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000, // 5 minute timeout
          onUploadProgress: (e) => {
            if (e.total) {
              const percent = Math.round((e.loaded / e.total) * 100);
              setUploadProgress(percent);
            }
          }
        });
        
        if (response.data && response.data.url) {
          // Show brief success before closing overlay
          setUploadSuccess(true);
          setTimeout(() => {
            setIsUploading(false);
            setUploadProgress(0);
            setUploadSuccess(false);
            callback(response.data.url, { title: file.name });
          }, 800);
        } else {
          // No URL in response - show error
          setIsUploading(false);
          setUploadProgress(0);
          setUploadError('Upload completed but no URL was returned. Please try again.');
          setTimeout(() => setUploadError(null), 5000);
        }
      } catch (error) {
        setIsUploading(false);
        setUploadProgress(0);
        const errorMsg = error.response?.data?.detail || error.message || 'Upload failed';
        setUploadError(`Upload failed: ${errorMsg}`);
        setTimeout(() => setUploadError(null), 5000);
      }
    };

    input.click();
  };

  return (
    <div className="rich-text-editor-wrapper relative">
      {/* Upload Progress Overlay - Fixed position to appear above TinyMCE dialogs */}
      {isUploading && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center backdrop-blur-sm"
          style={{ zIndex: 100000 }}
          data-testid="editor-upload-overlay"
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 shadow-2xl min-w-[320px]">
            <div className="flex items-center gap-3 mb-4">
              {uploadSuccess ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
              )}
              <div>
                <p className="text-white font-medium">
                  {uploadSuccess ? 'Upload complete!' : 'Uploading file...'}
                </p>
                <p className="text-zinc-400 text-sm truncate max-w-[220px]">{uploadFileName}</p>
              </div>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  uploadSuccess ? 'bg-gradient-to-r from-green-500 to-green-400' : 'bg-gradient-to-r from-orange-500 to-orange-400'
                }`}
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className={`text-center text-sm font-medium mt-2 ${uploadSuccess ? 'text-green-400' : 'text-orange-400'}`}>
              {uploadSuccess ? 'Inserting...' : `${uploadProgress}%`}
            </p>
          </div>
        </div>
      )}
      {/* Error notification */}
      {uploadError && (
        <div 
          className="fixed top-4 right-4 bg-red-900/90 border border-red-700 rounded-lg p-4 shadow-2xl max-w-[400px] flex items-start gap-3 animate-in slide-in-from-top"
          style={{ zIndex: 100001 }}
          data-testid="editor-upload-error"
        >
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-200 text-sm font-medium">Upload Error</p>
            <p className="text-red-300 text-xs mt-1">{uploadError}</p>
          </div>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-200 ml-2">
            &times;
          </button>
        </div>
      )}
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
          license_key: 'gpl',
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
          
          // Link settings - enable advanced link options
          link_default_target: '_blank',
          link_assume_external_targets: true,
          link_context_toolbar: true,
          link_title: true,
          
          // Image settings - enable upload tab in image dialog
          image_advtab: true,
          image_caption: true,
          image_title: true,
          image_uploadtab: true,
          
          // File picker for uploads (enables browse button)
          file_picker_types: 'image media file',
          file_picker_callback: handleFilePicker,
          
          // Media settings - allow audio and video embeds
          media_live_embeds: true,
          audio_template_callback: (data) => {
            return `<audio controls src="${data.source}"><source src="${data.source}" /></audio>`;
          },
          
          // Quick toolbars
          quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote',
          quickbars_insert_toolbar: 'quickimage quicktable',
          contextmenu: 'link image table',
          
          // Image upload settings - enables drag/drop and paste
          paste_data_images: true,
          automatic_uploads: true,
          images_upload_handler: handleImageUpload,
          images_reuse_filename: true,
          
          // Content styling
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
            a { color: #f97316; text-decoration: underline; cursor: pointer; }
            a:hover { color: #fb923c; }
            h1, h2, h3, h4, h5, h6 { color: #ffffff; margin-top: 1.5em; margin-bottom: 0.5em; }
            pre { background-color: #18181b; padding: 1em; border-radius: 6px; overflow-x: auto; }
            code { background-color: #18181b; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
            blockquote { border-left: 3px solid #f97316; margin-left: 0; padding-left: 1em; color: #a1a1aa; }
            table { border-collapse: collapse; width: 100%; }
            table td, table th { border: 1px solid #3f3f46; padding: 8px; }
            table th { background-color: #18181b; }
            img { max-width: 100%; height: auto; border-radius: 4px; }
            hr { border: none; border-top: 1px solid #3f3f46; margin: 1.5em 0; }
          `,
          skin: 'oxide-dark',
          content_css: 'dark',
          branding: false,
          promotion: false,
          resize: true,
          statusbar: true,
          elementpath: false,
          
          // Setup callback
          setup: (editor) => {
            editor.on('init', () => {
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
        /* Style the link dialog */
        .tox .tox-dialog {
          background-color: #18181b !important;
          border: 1px solid #3f3f46 !important;
        }
        .tox .tox-dialog__header {
          background-color: #18181b !important;
          border-bottom: 1px solid #3f3f46 !important;
        }
        .tox .tox-dialog__body {
          background-color: #18181b !important;
        }
        .tox .tox-dialog__footer {
          background-color: #18181b !important;
          border-top: 1px solid #3f3f46 !important;
        }
        .tox .tox-textfield, .tox .tox-listboxfield .tox-listbox--select {
          background-color: #27272a !important;
          border-color: #3f3f46 !important;
          color: #e4e4e7 !important;
        }
        .tox .tox-label {
          color: #a1a1aa !important;
        }
        .tox .tox-button--secondary {
          background-color: #27272a !important;
          border-color: #3f3f46 !important;
          color: #e4e4e7 !important;
        }
        .tox .tox-button {
          background-color: #f97316 !important;
          border-color: #f97316 !important;
          color: white !important;
        }
        .tox .tox-button:hover {
          background-color: #ea580c !important;
          border-color: #ea580c !important;
        }
      `}</style>
      {/* Global TinyMCE z-index fix for dialogs/dropdowns */}
      <style>{`
        /* Ensure TinyMCE floating elements appear above dialogs */
        .tox.tox-tinymce-aux {
          z-index: 10000 !important;
        }
        .tox .tox-dialog-wrap {
          z-index: 10001 !important;
        }
        .tox .tox-dialog-wrap__backdrop {
          z-index: 10000 !important;
        }
        .tox .tox-menu {
          z-index: 10002 !important;
        }
        .tox .tox-collection__item {
          cursor: pointer !important;
        }
        .tox-tinymce {
          z-index: 1 !important;
        }
        /* Fix for editor iframe clickability */
        .tox .tox-edit-area {
          z-index: 1 !important;
        }
        .tox .tox-edit-area iframe {
          z-index: 1 !important;
        }
        /* Ensure toolbar is clickable */
        .tox .tox-toolbar-overlord,
        .tox .tox-toolbar__primary,
        .tox .tox-toolbar__overflow {
          z-index: 2 !important;
        }
        /* Fix autocompleter dropdown */
        .tox .tox-autocompleter {
          z-index: 10003 !important;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
