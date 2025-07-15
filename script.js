// ===============================================================
// !! 중요 !!
// SAM 배포 후 출력되는 API Gateway의 엔드포인트 URL을 여기에 붙여넣으세요.
// 예: "https://xxxxxxxxxx.execute-api.ap-northeast-2.amazonaws.com/Prod"
const API_ENDPOINT = "https://avrc1zot79.execute-api.ap-northeast-2.amazonaws.com"; 
// ===============================================================


const fileInput = document.getElementById('file-input');
const uploadArea = document.getElementById('upload-area');
const statusArea = document.getElementById('status-area');
const resultArea = document.getElementById('result-area');

const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const downloadLink = document.getElementById('download-link');
const resetButton = document.getElementById('reset-button');

if (API_ENDPOINT === "") {
    alert("script.js 파일의 API_ENDPOINT 변수를 설정해야 합니다.");
    uploadArea.innerHTML = `<p class="text-center text-red-500">설정이 필요합니다. script.js 파일을 열어 API_ENDPOINT를 입력해주세요.</p>`;
}

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
});

// 드래그 앤 드롭 이벤트
uploadArea.addEventListener('dragover', (event) => {
    event.preventDefault();
    uploadArea.firstElementChild.classList.add('border-blue-500', 'bg-gray-50');
});
uploadArea.addEventListener('dragleave', (event) => {
    uploadArea.firstElementChild.classList.remove('border-blue-500', 'bg-gray-50');
});
uploadArea.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadArea.firstElementChild.classList.remove('border-blue-500', 'bg-gray-50');
    const file = event.dataTransfer.files[0];
    if (file) {
        handleFile(file);
    }
});

resetButton.addEventListener('click', () => {
    uploadArea.classList.remove('hidden');
    statusArea.classList.add('hidden');
    resultArea.classList.add('hidden');
    resetButton.classList.add('hidden');
    fileInput.value = ''; // 파일 입력 초기화
});


function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function handleFile(file) {
    if (!file.type.startsWith('audio/wav')) {
        alert('WAV 파일만 업로드할 수 있습니다.');
        return;
    }

    // UI 상태 변경
    uploadArea.classList.add('hidden');
    statusArea.classList.remove('hidden');
    resultArea.classList.add('hidden');
    resetButton.classList.add('hidden');

    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatBytes(file.size);
    progressBar.style.width = '0%';
    statusText.textContent = '업로드 준비 중...';

    try {
        // 1. 백엔드에 pre-signed URL 요청
        statusText.textContent = '업로드 주소 요청 중...';
        const response = await fetch(`${API_ENDPOINT}/get-upload-url?fileName=${encodeURIComponent(file.name)}`);
        if (!response.ok) {
            throw new Error(`API 서버 오류: ${response.statusText}`);
        }
        const { uploadUrl } = await response.json();
        progressBar.style.width = '20%';

        // 2. S3로 파일 업로드 (XMLHttpRequest 사용으로 진행률 추적)
        statusText.textContent = '파일 업로드 중...';
        await uploadToS3(uploadUrl, file);
        progressBar.style.width = '60%';

        // 3. 변환 대기
        statusText.textContent = '서버에서 ��환 중... (몇 초 정도 걸릴 수 있습니다)';
        // 실제 프로덕션에서는 WebSocket이나 폴링으로 완료 여부를 확인해야 함
        // 여기서는 S3 경로를 예측하여 잠시 후 다운로드 링크를 활성화
        await new Promise(resolve => setTimeout(resolve, 8000)); // 변환 시간 대기 (파일 크기에 따라 조절 필요)
        progressBar.style.width = '100%';
        statusText.textContent = '변환 완료!';

        // 4. 결과 표시
        const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
        const m4aFileName = `${baseName}.m4a`;
        const downloadUrl = uploadUrl.split('?')[0].replace('uploads/', 'converted/').replace('.wav', '.m4a');
        
        downloadLink.href = downloadUrl;
        downloadLink.setAttribute('download', m4aFileName);
        
        statusArea.classList.add('hidden');
        resultArea.classList.remove('hidden');
        resetButton.classList.remove('hidden');

    } catch (error) {
        console.error('오류 발생:', error);
        statusText.textContent = `오류: ${error.message}`;
        statusText.classList.remove('text-blue-600');
        statusText.classList.add('text-red-500');
        resetButton.classList.remove('hidden');
    }
}

function uploadToS3(url, file) {
    return new Promise((resolve, reject) => {
        const logWithTimestamp = (message, ...data) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] ${message}`, ...data);
        };

        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.setRequestHeader('Content-Type', 'audio/wav');

        logWithTimestamp('S3 Upload Request:', {
            url: url,
            method: 'PUT',
            headers: { 'Content-Type': 'audio/wav' }
        });

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                progressBar.style.width = `${20 + (percentComplete * 0.4)}%`;
            }
        };

        xhr.onloadstart = () => logWithTimestamp('Upload started.');
        xhr.onloadend = () => logWithTimestamp('Upload finished.');
        
        xhr.onreadystatechange = () => {
            logWithTimestamp(`XHR state changed: ${xhr.readyState}`);
            if (xhr.readyState === 4) {
                 logWithTimestamp('XHR Response:', {
                    status: xhr.status,
                    statusText: xhr.statusText,
                    response: xhr.response,
                    headers: xhr.getAllResponseHeaders()
                });
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                logWithTimestamp('S3 upload successful.');
                resolve();
            } else {
                logWithTimestamp(`S3 upload failed with status: ${xhr.status} ${xhr.statusText}`, 'error');
                reject(new Error(`S3 업로드 실패: ${xhr.statusText}`));
            }
        };

        xhr.onerror = () => {
            logWithTimestamp('S3 upload failed due to a network error.', 'error');
            reject(new Error('네트워크 오류로 S3 업로드에 실패했습니다.'));
        };
        
        xhr.onabort = () => logWithTimestamp('S3 upload aborted.', 'warn');
        xhr.ontimeout = () => logWithTimestamp('S3 upload timed out.', 'error');

        xhr.send(file);
    });
}
