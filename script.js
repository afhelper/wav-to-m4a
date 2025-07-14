// ===============================================================
// !! 중요 !!
// SAM 배포 후 출력되는 API Gateway의 엔드포인트 URL을 여기에 붙여넣으세요.
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
    if (file) handleFile(file);
});

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
    if (file) handleFile(file);
});

resetButton.addEventListener('click', () => {
    uploadArea.classList.remove('hidden');
    statusArea.classList.add('hidden');
    resultArea.classList.add('hidden');
    resetButton.classList.add('hidden');
    fileInput.value = '';
});

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper to read file as Base64
function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]); // Get only the base64 content
        reader.onerror = error => reject(error);
    });
}

async function handleFile(file) {
    if (!file.type.startsWith('audio/wav')) {
        alert('WAV 파일만 업로드할 수 있습니다.');
        return;
    }

    // UI 초기화
    uploadArea.classList.add('hidden');
    statusArea.classList.remove('hidden');
    resultArea.classList.add('hidden');
    resetButton.classList.add('hidden');
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatBytes(file.size);
    progressBar.style.width = '0%';
    statusText.textContent = '업로드 준비 중...';
    statusText.classList.remove('text-red-500');
    statusText.classList.add('text-blue-600');

    try {
        // 1. 파일을 Base64로 인코딩
        statusText.textContent = '파일을 서버로 전송 준비 중...';
        progressBar.style.width = '10%';
        const fileContentBase64 = await toBase64(file);
        progressBar.style.width = '30%';

        // 2. 서버로 파일 업로드
        statusText.textContent = '파일을 서버��� 업로드 중...';
        const uploadResponse = await fetch(`${API_ENDPOINT}/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fileName: file.name,
                fileContent: fileContentBase64,
            }),
        });

        if (!uploadResponse.ok) {
            const errorBody = await uploadResponse.json();
            throw new Error(`서버 업로드 실패: ${errorBody.error || uploadResponse.statusText}`);
        }
        
        const { converted_key } = await uploadResponse.json();
        progressBar.style.width = '60%';

        // 3. 변환 완료 폴링
        statusText.textContent = '서버에서 변환 중...';
        const downloadUrl = await pollForConversion(converted_key);
        progressBar.style.width = '100%';
        statusText.textContent = '변환 완료!';

        // 4. 결과 표시
        downloadLink.href = downloadUrl;
        downloadLink.setAttribute('download', converted_key.replace('converted/', ''));
        
        statusArea.classList.add('hidden');
        resultArea.classList.remove('hidden');
        resetButton.classList.remove('hidden');

    } catch (error) {
        console.error('오류 발생:', error);
        statusText.textContent = `오류: ${error.message}`;
        statusText.classList.add('text-red-500');
        resetButton.classList.remove('hidden');
    }
}

async function pollForConversion(fileKey, maxAttempts = 20, interval = 3000) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const statusResponse = await fetch(`${API_ENDPOINT}/status/${fileKey}`);
            if (statusResponse.ok) {
                const data = await statusResponse.json();
                if (data.status === 'CONVERTED') {
                    return data.downloadUrl;
                }
                // PENDING, continue polling
                const progress = 60 + (i / maxAttempts) * 40;
                progressBar.style.width = `${progress}%`;
            }
        } catch (error) {
            console.warn(`Polling attempt ${i + 1} failed:`, error);
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('변환 시간 초과. 파일이 너무 크거나 서버에 문제가 발생했습니다.');
}