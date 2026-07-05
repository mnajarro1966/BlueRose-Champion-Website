const videoButton = document.querySelector(".video-button");
const videoOverlay = document.getElementById("videoOverlay");
const blueVideo = document.getElementById("blueVideo");

const videoURL =
"https://pub-cd4aa059c1b14f9bbc08c58e5e37cbb5.r2.dev/intro.mp4";

videoButton.addEventListener("click", () => {

    videoOverlay.classList.add("active");

    document.body.style.overflow = "hidden";

    blueVideo.src = videoURL;

    blueVideo.load();

    blueVideo.play();

});

blueVideo.addEventListener("ended", () => {

    videoOverlay.classList.remove("active");

    document.body.style.overflow = "auto";

    blueVideo.pause();

    blueVideo.currentTime = 0;

});

videoOverlay.addEventListener("click", (e) => {

    if (e.target === videoOverlay) {

        blueVideo.pause();

        blueVideo.currentTime = 0;

        videoOverlay.classList.remove("active");

        document.body.style.overflow = "auto";

    }

});