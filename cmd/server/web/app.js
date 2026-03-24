const token = localStorage.getItem("token")

if (!token) {
    window.location.href = "/login.html"
}

/* ===============================
   INIT
=================================*/

document.addEventListener("DOMContentLoaded", () => {
    setupDropzone()
    loadFiles()
})

/* ===============================
   FILE LOADING
=================================*/

async function loadFiles() {
    const res = await fetch("/api/v1/files", {
        headers: { "Authorization": "Bearer " + token }
    })

    if (res.status === 401) {
        logout()
        return
    }

    const files = await res.json()
    renderFiles(files)
}

function renderFiles(files) {
    const container = document.getElementById("files")
    const emptyState = document.getElementById("emptyState")
    const fileCount = document.getElementById("fileCount")

    container.innerHTML = ""

    if (!files.length) {
        emptyState.classList.remove("hidden")
        fileCount.innerText = ""
        return
    }

    emptyState.classList.add("hidden")
    fileCount.innerText = `${files.length} file(s)`

    files.forEach(file => {
        const row = document.createElement("div")
        row.className =
            "flex justify-between items-center bg-gray-800 px-4 py-3 rounded-lg hover:bg-gray-700 transition"

        row.innerHTML = `
            <div class="flex flex-col">
                <span class="font-medium">${file.name}</span>
                <span class="text-xs text-gray-400">${formatSize(file.size)}</span>
            </div>

            <div class="flex gap-2">
                <button onclick="downloadFile('${file.name}')"
                    class="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm">
                    Download
                </button>

                <button onclick="deleteFile('${file.name}', this)"
                    class="bg-red-600 hover:bg-red-500 px-3 py-1 rounded text-sm">
                    Delete
                </button>
            </div>
        `

        container.appendChild(row)
    })
}

/* ===============================
   DELETE
=================================*/

async function deleteFile(name, btn) {
    const res = await fetch(`/api/v1/files/${name}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    })

    if (res.ok) {
        btn.closest("div").parentElement.remove()
        showToast("File deleted", "success")
        loadFiles()
    } else {
        showToast("Delete failed", "error")
    }
}

/* ===============================
   DOWNLOAD
=================================*/

function downloadFile(name) {
    window.open(`/file/${name}?download=1`)
}

/* ===============================
   UPLOAD
=================================*/

function setupDropzone() {
    const dropzone = document.getElementById("dropzone")
    const fileInput = document.getElementById("fileInput")

    dropzone.addEventListener("click", () => fileInput.click())

    dropzone.addEventListener("dragover", e => {
        e.preventDefault()
        dropzone.classList.add("drop-active")
    })

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("drop-active")
    })

    dropzone.addEventListener("drop", e => {
        e.preventDefault()
        dropzone.classList.remove("drop-active")
        const file = e.dataTransfer.files[0]
        uploadFile(file)
    })

    fileInput.addEventListener("change", e => {
        const file = e.target.files[0]
        uploadFile(file)
    })
}

function uploadFile(file) {
    if (!file) return

    const progressContainer = document.getElementById("progressContainer")
    const progressBar = document.getElementById("progressBar")

    progressContainer.classList.remove("hidden")
    progressBar.style.width = "0%"

    const formData = new FormData()
    formData.append("file", file)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/upload")

    xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100
            progressBar.style.width = percent + "%"
        }
    }

    xhr.onload = () => {
        progressContainer.classList.add("hidden")
        progressBar.style.width = "0%"
        showToast("File uploaded", "success")
        loadFiles()
    }

    xhr.onerror = () => {
        progressContainer.classList.add("hidden")
        showToast("Upload failed", "error")
    }

    xhr.send(formData)
}

/* ===============================
   TOAST SYSTEM
=================================*/

function showToast(message, type) {
    const container = document.getElementById("toastContainer")

    const toast = document.createElement("div")
    toast.className =
        "px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition opacity-0 translate-y-2"

    if (type === "success") {
        toast.classList.add("bg-green-600")
    } else {
        toast.classList.add("bg-red-600")
    }

    toast.innerText = message
    container.appendChild(toast)

    setTimeout(() => {
        toast.classList.remove("opacity-0", "translate-y-2")
    }, 10)

    setTimeout(() => {
        toast.classList.add("opacity-0", "translate-y-2")
        setTimeout(() => toast.remove(), 300)
    }, 3000)
}

/* ===============================
   UTILS
=================================*/

function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(2) + " MB"
}

function logout() {
    localStorage.removeItem("token")
    window.location.href = "/login.html"
}