import React, { useState, useEffect, useCallback } from 'react';
import { FileUploader } from './components/FileUploader';
import { Spinner } from './components/Spinner';
import { DownloadIcon } from './components/icons';

interface CompressedResult {
  blob: Blob;
  size: number;
  url: string;
}

const App: React.FC = () => {
  const [originalFiles, setOriginalFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState<number>(0.8);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [compressedResults, setCompressedResults] = useState<Map<string, CompressedResult>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  const formatBytes = (bytes: number, decimals = 2): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleFileSelect = (files: File[]) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0 && files.length > 0) {
       setErrors(new Map([['global', 'Пожалуйста, выберите файлы изображений.']]));
       return;
    }
    setErrors(new Map());
    setOriginalFiles(imageFiles.slice(0, 5)); // Limit to 5 files
    setCompressedResults(new Map());
  };

  const handleReset = () => {
    // Revoke all existing object URLs to prevent memory leaks
    compressedResults.forEach(result => URL.revokeObjectURL(result.url));
    setOriginalFiles([]);
    setCompressedResults(new Map());
    setErrors(new Map());
    setQuality(0.8);
  };
  
  const getCompressedFileName = (originalName: string): string => {
    const nameParts = originalName.split('.');
    nameParts.pop();
    return `${nameParts.join('.')}_KolerskyAI_compressed.jpg`;
  };

  const compressFile = useCallback(async (file: File, qualityValue: number): Promise<CompressedResult> => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        if (typeof e.target?.result !== 'string') {
          return reject(new Error('Не удалось прочитать файл.'));
        }
        image.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Ошибка чтения файла.'));

      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Не удалось получить контекст холста.'));
        }
        ctx.drawImage(image, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                blob,
                size: blob.size,
                url: URL.createObjectURL(blob),
              });
            } else {
              reject(new Error('Не удалось создать blob.'));
            }
          },
          'image/jpeg',
          qualityValue
        );
      };
      image.onerror = () => reject(new Error('Не удалось загрузить изображение.'));

      reader.readAsDataURL(file);
    });
  }, []);

  useEffect(() => {
    if (originalFiles.length === 0) return;

    const processFiles = async () => {
      setIsProcessing(true);
      
      // Clean up previous results before re-compressing
      const oldResults = new Map(compressedResults);
      setCompressedResults(new Map());
      oldResults.forEach(result => URL.revokeObjectURL(result.url));
      
      const newErrors = new Map<string, string>();

      const results = await Promise.allSettled(
        originalFiles.map(file => compressFile(file, quality))
      );

      const newCompressedResults = new Map<string, CompressedResult>();
      results.forEach((result, index) => {
        const file = originalFiles[index];
        if (result.status === 'fulfilled') {
          newCompressedResults.set(file.name, result.value);
        } else {
          // Fix: The 'reason' for a rejected promise is of type 'any'. Using a type guard (`instanceof Error`) 
          // ensures we can safely access the 'message' property and avoids potential runtime errors.
          // This also helps TypeScript's type inference, likely fixing the root cause of the reported error.
          if (result.reason instanceof Error) {
            newErrors.set(file.name, result.reason.message);
          } else {
            newErrors.set(file.name, String(result.reason) || 'Не удалось сжать.');
          }
        }
      });

      setCompressedResults(newCompressedResults);
      setErrors(newErrors);
      setIsProcessing(false);
    };

    processFiles();
    
    // This effect should only run when files or quality change.
    // The cleanup function for URL.revokeObjectURL is handled in handleReset and before re-compression.
  }, [originalFiles, quality, compressFile]);

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gray-100">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl p-6 md:p-8 transition-all duration-300">
        {originalFiles.length === 0 ? (
          <>
            <h1 className="text-2xl md:text-3xl font-bold text-center text-gray-800 mb-2">Сжатие Изображений</h1>
            <p className="text-center text-gray-500 mb-6">Уменьшайте размер файлов JPEG. Можно загрузить до 5 файлов.</p>
            <FileUploader onFileSelect={handleFileSelect} />
            {errors.has('global') && <p className="text-red-500 text-center mt-4">{errors.get('global')}</p>}
          </>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Результаты сжатия</h2>
              <button
                onClick={handleReset}
                className="text-sm text-blue-600 hover:text-blue-800 font-semibold transition-colors"
              >
                Загрузить новые
              </button>
            </div>
            
            <div className="mb-6">
                <label htmlFor="quality" className="block text-sm font-medium text-gray-700 mb-2">Качество: <span className="font-bold text-blue-600">{Math.round(quality * 100)}%</span></label>
                <input
                    id="quality"
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={quality}
                    onChange={(e) => setQuality(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    disabled={isProcessing}
                />
            </div>

            <div className="space-y-4">
              {originalFiles.map(file => {
                const result = compressedResults.get(file.name);
                const error = errors.get(file.name);
                const sizeReduction = result ? Math.round(((file.size - result.size) / file.size) * 100) : 0;

                return (
                  <div key={file.name} className="bg-gray-50 rounded-lg p-3 flex flex-col sm:flex-row items-center gap-4 border">
                    <div className="w-16 h-16 flex-shrink-0 bg-gray-200 rounded-md overflow-hidden flex items-center justify-center">
                      {isProcessing && !result ? (
                          <Spinner />
                      ) : result ? (
                          <img src={result.url} alt="Preview" className="w-full h-full object-contain" />
                      ) : null}
                    </div>

                    <div className="flex-grow text-center sm:text-left w-full">
                      <p className="font-bold text-gray-800 break-all truncate" title={file.name}>{file.name}</p>
                      <div className="mt-1 text-xs text-gray-600">
                        <span>{formatBytes(file.size)}</span>
                        <span className="mx-1">→</span>
                        {isProcessing && !result ? (
                          <span className="italic text-gray-500">сжимается...</span>
                        ) : result ? (
                          <span className="font-medium text-green-600">{formatBytes(result.size)} ({sizeReduction}%)</span>
                        ) : error ? (
                           <span className="font-medium text-red-500">Ошибка</span>
                        ) : '...'}
                      </div>
                    </div>
                    
                    <a
                      href={result?.url}
                      download={getCompressedFileName(file.name)}
                      className={`w-full sm:w-auto flex-shrink-0 flex items-center justify-center text-center px-4 py-2 rounded-lg font-bold text-white text-sm transition-all duration-300 ${!result || isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                      aria-disabled={!result || isProcessing}
                      onClick={(e) => (!result || isProcessing) && e.preventDefault()}
                    >
                      <DownloadIcon className="w-4 h-4 mr-2"/>
                      Скачать
                    </a>
                  </div>
                );
              })}
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
};

export default App;