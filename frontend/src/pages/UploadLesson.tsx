import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import {
  getPresignedUrl,
  PresignedUrlResponse,
} from "../hooks/useLessonUpload";

export function UploadLesson() {
  const [lessonId, setLessonId] = useState("");
  const [level, setLevel] = useState("a1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presignedUrl, setPresignedUrl] = useState<PresignedUrlResponse | null>(
    null,
  );
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [merging, setMerging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);

  const handleGetUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await getPresignedUrl(lessonId, level);
      setPresignedUrl(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate URL");
      setPresignedUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfFiles = files.filter((f) => f.type === "application/pdf");

    if (pdfFiles.length !== files.length) {
      setError("Only PDF files are supported");
    } else {
      setError(null);
    }

    setSelectedFiles([...selectedFiles, ...pdfFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((files) => files.filter((_, i) => i !== index));
  };

  const handleMergeAndUpload = async () => {
    if (selectedFiles.length === 0 || !presignedUrl) return;

    setError(null);
    setMerging(true);
    setMergeProgress(0);

    try {
      console.log(`[Merge] Starting merge of ${selectedFiles.length} files...`);

      // Create new PDF document
      const mergedPdf = await PDFDocument.create();

      // Process each file
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        console.log(
          `[Merge] Processing file ${i + 1}/${selectedFiles.length}: ${file.name}`,
        );

        const buffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(buffer);
        const pageIndices = pdf.getPageIndices();
        const pages = await mergedPdf.copyPages(pdf, pageIndices);

        pages.forEach((page) => {
          mergedPdf.addPage(page);
        });

        setMergeProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
      }

      console.log(`[Merge] Saving merged PDF...`);
      const mergedBytes = await mergedPdf.save();
      const mergedBlob = new Blob([new Uint8Array(mergedBytes)], {
        type: "application/pdf",
      });
      const lessonNum = String(parseInt(lessonId)).padStart(2, "0");
      const mergedFile = new File(
        [mergedBlob],
        `lesson_${lessonNum}_merged.pdf`,
        { type: "application/pdf" },
      );

      console.log(
        `[Merge] Merge complete! File size: ${(mergedFile.size / 1024 / 1024).toFixed(2)}MB`,
      );
      setMerging(false);

      // Now upload the merged file
      await uploadMergedFile(mergedFile);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Merge failed";
      console.error(`[Merge] ${errorMsg}`);
      setError(errorMsg);
      setMerging(false);
      setMergeProgress(0);
    }
  };

  const uploadMergedFile = async (file: File) => {
    if (!presignedUrl) return;

    setUploading(true);
    setUploadProgress(1);
    setUploadSuccess(false);

    console.log(`[Upload] Starting upload: ${file.name} (${file.size} bytes)`);

    return new Promise<void>((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        let progressTimeout: ReturnType<typeof setTimeout> | null = null;

        xhr.upload.addEventListener("progress", (event) => {
          if (progressTimeout !== null) {
            clearTimeout(progressTimeout);
            progressTimeout = null;
          }
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            console.log(`[Upload] Progress: ${percent}%`);
            setUploadProgress(Math.max(1, percent));
          }
        });

        xhr.addEventListener("load", () => {
          if (progressTimeout !== null) {
            clearTimeout(progressTimeout);
            progressTimeout = null;
          }
          console.log(
            `[Upload] Complete. Status: ${xhr.status} -- ${xhr.responseText}`,
          );
          console.log(`[Upload] Response Headers:`, {
            contentType: xhr.getResponseHeader("Content-Type"),
            corsOrigin: xhr.getResponseHeader("Access-Control-Allow-Origin"),
            corsMethods: xhr.getResponseHeader("Access-Control-Allow-Methods"),
          });

          if (xhr.status >= 200 && xhr.status < 300) {
            console.log(`[Upload] Success! File uploaded to S3.`);
            setUploadSuccess(true);
            setUploading(false);
            setUploadProgress(100);
            resolve();
          } else {
            // Log detailed error info
            console.error(`[Upload] ❌ Upload Failed`);
            console.error(`[Upload] Status Code: ${xhr.status}`);
            console.error(`[Upload] Status Text: ${xhr.statusText}`);
            console.error(`[Upload] Response Body (first 500 chars):`);
            console.error(xhr.responseText.substring(0, 500));

            // Try to parse XML error
            try {
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(
                xhr.responseText,
                "text/xml",
              );
              const errorCode =
                xmlDoc.getElementsByTagName("Code")[0]?.textContent;
              const errorMessage =
                xmlDoc.getElementsByTagName("Message")[0]?.textContent;
              console.error(`[Upload] S3 Error Code: ${errorCode}`);
              console.error(`[Upload] S3 Error Message: ${errorMessage}`);
            } catch (e) {
              console.error(`[Upload] Could not parse XML response`);
            }

            console.error(
              `[Upload] Presigned URL (first 80 chars):`,
              presignedUrl.uploadUrl.substring(0, 80) + "...",
            );
            console.error(`[Upload] File: ${file.name} (${file.size} bytes)`);
            console.error(
              `[Upload] Content-Type Header Sent:`,
              file.type || "application/pdf",
            );

            let errorMsg = `Upload failed with status ${xhr.status}`;

            if (xhr.status === 403) {
              errorMsg =
                "403 Forbidden - Check console for details. Possible causes:\n" +
                "• Presigned URL expired (generate a new one)\n" +
                "• URL signature is invalid\n" +
                "• S3 bucket CORS not configured\n" +
                "• Infrastructure not deployed";
              console.error(`[Upload] 🔴 CORS Headers Expected:`, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "PUT",
              });
            } else if (xhr.status === 404) {
              errorMsg = "404 Not Found - Bucket or key doesn't exist";
            } else if (xhr.status === 400) {
              errorMsg = "400 Bad Request - Invalid file or headers";
            }

            console.error(`[Upload] Error Message: ${errorMsg}`);
            setError(errorMsg);
            setUploading(false);
            setUploadProgress(0);
            resolve();
          }
        });

        xhr.addEventListener("error", () => {
          if (progressTimeout !== null) {
            clearTimeout(progressTimeout);
            progressTimeout = null;
          }
          const errorMsg = "Network error during upload";
          console.error(`[Upload] ❌ ${errorMsg}`);
          console.error(`[Upload] Status: ${xhr.status}`);
          console.error(`[Upload] Status Text: ${xhr.statusText}`);
          console.error(`[Upload] Response:`, xhr.responseText);
          setError(errorMsg);
          setUploading(false);
          setUploadProgress(0);
          resolve();
        });

        xhr.addEventListener("abort", () => {
          if (progressTimeout !== null) {
            clearTimeout(progressTimeout);
            progressTimeout = null;
          }
          console.warn(`[Upload] Aborted by user`);
          setUploading(false);
          setUploadProgress(0);
          resolve();
        });

        progressTimeout = setTimeout(
          () => {
            console.error(`[Upload] Timeout - no response for 10 minutes`);
            xhr.abort();
            setError("Upload timeout - please try again");
            setUploading(false);
            setUploadProgress(0);
            resolve();
          },
          10 * 60 * 1000,
        );

        console.log(`[Upload] 📋 Request Details:`);
        console.log(`  - URL: ${presignedUrl.uploadUrl.substring(0, 100)}...`);
        console.log(`  - Method: PUT`);
        console.log(`  - File: ${file.name}`);
        console.log(`  - Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  - Content-Type: ${file.type || "application/pdf"}`);

        xhr.open("PUT", presignedUrl.uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "application/pdf");

        console.log(`[Upload] Sending request to S3...`);
        xhr.send(file);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        console.error(`[Upload] Exception: ${errorMsg}`);
        setError(errorMsg);
        setUploading(false);
        setUploadProgress(0);
        resolve();
      }
    });
  };

  const handleReset = () => {
    setPresignedUrl(null);
    setLessonId("");
    setError(null);
    setSelectedFiles([]);
    setUploading(false);
    setUploadProgress(0);
    setUploadSuccess(false);
    setMerging(false);
    setMergeProgress(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-2">
            Upload Lesson PDF
          </h1>
          <p className="text-slate-600">
            Upload single or multiple PDFs and merge them into one
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-md p-6 sm:p-8 space-y-6">
          {/* Form */}
          <form onSubmit={handleGetUrl} className="space-y-4">
            <div>
              <label
                htmlFor="lessonId"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Lesson ID *
              </label>
              <input
                id="lessonId"
                type="number"
                min="1"
                max="24"
                value={lessonId}
                onChange={(e) => setLessonId(e.target.value)}
                placeholder="e.g., 3"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading || uploadSuccess}
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Enter lesson number (1-24)
              </p>
            </div>

            <div>
              <label
                htmlFor="level"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Course Level
              </label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading || uploadSuccess}
              >
                <option value="a1">A1</option>
                <option value="a2">A2</option>
                <option value="b1">B1</option>
                <option value="b2">B2</option>
              </select>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700 font-medium">Error</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !lessonId || uploadSuccess}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {loading ? "Generating..." : "Get Upload Link"}
            </button>
          </form>

          {/* File Selection and Upload */}
          {presignedUrl && !uploadSuccess && (
            <div className="border-t border-slate-200 pt-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-700 mb-1">
                  ✓ Upload URL Generated
                </p>
                <p className="text-xs text-blue-600">
                  Valid for {presignedUrl.expiresIn / 60} minutes
                </p>
              </div>

              {/* File Upload Input */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Select PDF Files
                </label>
                <label className="block cursor-pointer">
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    <p className="text-sm text-slate-600 mb-2">
                      Click to select PDFs or drag and drop
                    </p>
                    <p className="text-xs text-slate-500">
                      {selectedFiles.length > 0
                        ? `${selectedFiles.length} file(s) selected`
                        : "Select one or more PDF files"}
                    </p>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={handleFileSelect}
                    disabled={merging || uploading}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">
                    Selected Files ({selectedFiles.length}):
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-slate-50 p-3 rounded border border-slate-200"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">
                            {idx + 1}. {file.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          disabled={merging || uploading}
                          className="ml-2 text-red-600 hover:text-red-700 text-sm font-medium disabled:text-slate-400"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Merge Progress */}
              {merging && (
                <div className="space-y-2 p-4 bg-purple-50 rounded border border-purple-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-semibold text-purple-700">
                        🔀 Merging PDFs...
                      </p>
                      <p className="text-xs text-purple-600 mt-1">
                        Combining {selectedFiles.length} files into one
                      </p>
                    </div>
                    <span className="text-lg font-bold text-purple-700">
                      {Math.round(mergeProgress)}%
                    </span>
                  </div>
                  <div className="w-full bg-purple-200 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${mergeProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Upload Progress */}
              {uploading && (
                <div className="space-y-2 p-4 bg-blue-50 rounded border border-blue-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-semibold text-blue-700">
                        📤 Uploading to S3...
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        {uploadProgress < 100
                          ? "Please keep this window open"
                          : "Processing complete"}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-blue-700">
                      {Math.round(uploadProgress)}%
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {!merging && !uploading && selectedFiles.length > 0 && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleMergeAndUpload}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                  >
                    {selectedFiles.length === 1
                      ? "📤 Upload PDF"
                      : `🔀 Merge & Upload (${selectedFiles.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFiles([])}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-lg transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Success State */}
          {uploadSuccess && (
            <div className="border-t border-slate-200 pt-6 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <p className="text-2xl mb-2">✓</p>
                <p className="text-lg font-semibold text-green-700 mb-1">
                  Upload Successful!
                </p>
                <p className="text-sm text-green-600">
                  Your PDF has been uploaded and the ingestion pipeline is
                  starting.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
                <p className="font-semibold mb-2">What happens next:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-600">
                  <li>S3 triggers the ingestion workflow</li>
                  <li>PDF is scanned with Amazon Textract</li>
                  <li>Content is processed with Claude AI</li>
                  <li>Lessons, exercises, and vocabulary are generated</li>
                  <li>Available in app within a few minutes</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Upload Another Lesson
              </button>
            </div>
          )}
        </div>

        {/* Help Section */}
        {!presignedUrl && !uploadSuccess && (
          <div className="mt-8 bg-slate-100 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              ❓ How it works
            </h2>
            <div className="space-y-3 text-sm text-slate-700">
              <div>
                <p className="font-semibold">Single PDF:</p>
                <p className="text-slate-600">
                  Select one PDF and upload directly
                </p>
              </div>
              <div>
                <p className="font-semibold">Multiple PDFs:</p>
                <p className="text-slate-600">
                  Select multiple PDFs, they'll be merged into one file, then
                  uploaded as a single lesson
                </p>
              </div>
              <div>
                <p className="font-semibold">Process:</p>
                <ol className="text-slate-600 list-decimal list-inside space-y-1">
                  <li>Enter lesson ID</li>
                  <li>Get upload link</li>
                  <li>Select PDF(s)</li>
                  <li>Click merge & upload</li>
                  <li>Pipeline starts automatically</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
