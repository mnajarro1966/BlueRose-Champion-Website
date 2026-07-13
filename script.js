const videoButton = document.querySelector(".video-button");
const videoOverlay = document.getElementById("videoOverlay");
const blueVideo = document.getElementById("blueVideo");

const videoParts = Array.from(
    { length: 38 },
    (_, index) => `Assets/videos/blue-rose-web/part-${String(index).padStart(3, "0")}.bin`
);

let videoURL;

async function getVideoURL() {

    if (videoURL) return videoURL;

    const responses = await Promise.all(videoParts.map((part) => fetch(part)));

    if (responses.some((response) => !response.ok)) {
        throw new Error("Unable to load the Blue Rose video.");
    }

    const parts = await Promise.all(responses.map((response) => response.arrayBuffer()));

    videoURL = URL.createObjectURL(new Blob(parts, { type: "video/mp4" }));

    return videoURL;
}

function closeVideo() {

    blueVideo.pause();

    blueVideo.currentTime = 0;

    videoOverlay.classList.remove("active");

    document.body.style.overflow = "auto";

}

videoButton.addEventListener("click", async () => {

    videoOverlay.classList.add("active");

    document.body.style.overflow = "hidden";

    videoButton.disabled = true;

    try {

        blueVideo.src = await getVideoURL();

        if (!videoOverlay.classList.contains("active")) return;

        blueVideo.load();

        await blueVideo.play().catch(() => {});

    } catch (error) {

        console.error(error);

        closeVideo();

    } finally {

        videoButton.disabled = false;

    }

});

blueVideo.addEventListener("ended", () => {

    closeVideo();

});

videoOverlay.addEventListener("click", (e) => {

    if (e.target === videoOverlay) {

        closeVideo();

    }

});

window.addEventListener("beforeunload", () => {

    if (videoURL) URL.revokeObjectURL(videoURL);

});
