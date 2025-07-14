// ===============================================================
// !! 중요 !!
// SAM 배포 후 출력되는 API Gateway의 엔드포인트 URL을 여기에 붙여넣으세요.
const API_ENDPOINT = "https://bbzfeoa0gb.execute-api.ap-northeast-2.amazonaws.com"; 
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

async function handleFile(file) {
    if (!file.type.startsWith('audio/wav')) {
        alert('WAV 파일만 업로드할 수 있습니다.');
        return;
    }
    
    const MAX_SIZE_MB = 50;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        alert(`파일 크기는 ${MAX_SIZE_MB}MB를 초과할 수 없습니다.`);
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
        // 1. 백엔드에 Presigned POST URL 요청
        statusText.textContent = '업로드 주소 요청 중...';
        progressBar.style.width = '10%';
        
        const presignedResponse = await fetch(`${API_ENDPOINT}/create-presigned-post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name })
        });

        if (!presignedResponse.ok) {
            const errorData = await presignedResponse.json();
            throw new Error(errorData.detail || `API 서버 오류: ${presignedResponse.statusText}`);
        }
        const presignedData = await presignedResponse.json();
        progressBar.style.width = '20%';

        // 2. S3로 파일 업로드 (Presigned POST 사용)
        statusText.textContent = '파일 업로드 중...';
        await uploadToS3WithPresignedPost(presignedData, file);
        progressBar.style.width = '60%';

        // 3. 변환 대기
        statusText.textContent = '서버에서 변환 중... (파일 크기에 따라 시간이 걸릴 수 있습니다)';
        await new Promise(resolve => setTimeout(resolve, 10000)); // 변환 시간 대기 (10초)
        progressBar.style.width = '100%';
        statusText.textContent = '변환 완료!';

        // 4. 결과 표시
        const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
        const m4aFileName = `${baseName}.m4a`;
        
        // 다운로드 URL 생성 (S3 버킷 URL + 변환된 파일 키)
        const s3BucketUrl = presignedData.url;
        const convertedKey = `converted/${encodeURIComponent(m4aFileName)}`;
        const downloadUrl = `${s3BucketUrl}/${convertedKey}`.replace('/uploads/','/converted/'); // A bit of a hack, but should work
        
        // A more robust way to get the bucket URL
        const finalDownloadUrl = new URL(s3BucketUrl);
        finalDownloadUrl.pathname = `converted/${m4aFileName}`;


        downloadLink.href = finalDownloadUrl.href;
        downloadLink.setAttribute('download', m4aFileName);
        
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

function uploadToS3WithPresignedPost(presignedData, file) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        // S3에서 요구하는 필드들을 FormData에 추가
        Object.keys(presignedData.fields).forEach(key => {
            formData.append(key, presignedData.fields[key]);
        });
        // 실제 파일 데이터는 마지막에 추가
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', presignedData.url, true);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total);
                // 전체 진행률의 20% ~ 60% 구간을 업로드 진행률로 표시
                progressBar.style.width = `${20 + (percentComplete * 40)}%`;
            }
        };

        xhr.onload = () => {
            // S3는 ��공 시 204 No Content 또는 200 OK를 반환할 수 있음
            if (xhr.status === 204 || xhr.status === 200) {
                resolve();
            } else {
                console.error('S3 Upload Error Response:', xhr.responseText);
                reject(new Error(`S3 업로드 실패: ${xhr.statusText} (서버 응답: ${xhr.responseText})`));
            }
        };

        xhr.onerror = () => {
            reject(new Error('네트워크 오류로 S3 업로드에 실패했습니다.'));
        };

        xhr.send(formData);
    });
}
