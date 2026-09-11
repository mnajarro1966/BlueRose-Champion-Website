const videoButton = document.querySelector(".video-button");
const videoOverlay = document.getElementById("videoOverlay");
const blueVideo = document.getElementById("blueVideo");
const videoParts = Array.from({ length: 38 }, (_, index) => `Assets/videos/blue-rose-web/part-${String(index).padStart(3, "0")}.bin`);
let videoURL;
async function getVideoURL(){if(videoURL)return videoURL;const responses=await Promise.all(videoParts.map((part)=>fetch(part)));if(responses.some((response)=>!response.ok))throw new Error("Unable to load the Blue Rose video.");const parts=await Promise.all(responses.map((response)=>response.arrayBuffer()));videoURL=URL.createObjectURL(new Blob(parts,{type:"video/mp4"}));return videoURL;}
function closeVideo(){blueVideo.pause();blueVideo.currentTime=0;videoOverlay.classList.remove("active");document.body.style.overflow="auto";}
videoButton.addEventListener("click",async()=>{videoOverlay.classList.add("active");document.body.style.overflow="hidden";videoButton.disabled=true;try{blueVideo.src=await getVideoURL();if(!videoOverlay.classList.contains("active"))return;blueVideo.load();await blueVideo.play().catch(()=>{});}catch(error){console.error(error);closeVideo();}finally{videoButton.disabled=false;}});
blueVideo.addEventListener("ended",closeVideo);videoOverlay.addEventListener("click",(e)=>{if(e.target===videoOverlay)closeVideo();});window.addEventListener("beforeunload",()=>{if(videoURL)URL.revokeObjectURL(videoURL);});

const sponsorModal=document.getElementById("sponsorModal");
const sponsorButton=document.querySelector(".sponsor-form-button");
const sponsorClose=document.querySelector(".sponsor-close");
const sponsorForm=document.getElementById("sponsorForm");
function openSponsorForm(){sponsorModal.classList.add("active");sponsorModal.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";}
function closeSponsorForm(){sponsorModal.classList.remove("active");sponsorModal.setAttribute("aria-hidden","true");document.body.style.overflow="auto";}
sponsorButton.addEventListener("click",openSponsorForm);
sponsorClose.addEventListener("click",closeSponsorForm);
sponsorModal.addEventListener("click",(e)=>{if(e.target===sponsorModal)closeSponsorForm();});
document.addEventListener("keydown",(e)=>{if(e.key==="Escape"&&sponsorModal.classList.contains("active"))closeSponsorForm();});

/* ===== BLUE'S JOURNEY — TOURNAMENT ALBUMS =====
   To add photos later, upload them under Assets/images/tournaments/<event-folder>/
   and add their paths to that tournament's photos array below.
*/
const tournamentAlbums = [
  {
    date: "Spring 2026",
    title: "ADCC West Coast Trials",
    result: "Third Place",
    photos: []
  },
  {
    date: "Summer 2026",
    title: "No-Gi American Nationals",
    result: "Gold",
    photos: []
  }
];

function buildJourneyAlbums(){
  const timeline=document.getElementById("journey");
  if(!timeline)return;

  const section=document.createElement("section");
  section.className="journey-albums";
  section.id="competition-albums";
  section.innerHTML=`
    <div class="journey-albums-header">
      <p class="journey-albums-eyebrow">Tournament by tournament</p>
      <h2>BLUE'S JOURNEY</h2>
      <p class="journey-albums-intro">A growing photo archive of Blue's competitions, milestones, and moments on the mats.</p>
    </div>
    <div class="tournament-album-grid"></div>`;

  const grid=section.querySelector(".tournament-album-grid");

  tournamentAlbums.forEach((album,index)=>{
    const card=document.createElement("article");
    card.className="tournament-album";
    const hasPhotos=album.photos.length>0;
    const cover=hasPhotos?`style="background-image:url('${album.photos[0]}')"`:"";
    card.innerHTML=`
      <div class="album-cover ${hasPhotos?"has-image":""}" ${cover}>
        ${hasPhotos?"":`<div class="album-placeholder"><i class="fa-regular fa-images"></i><span>PHOTO ALBUM READY</span></div>`}
        <span class="album-photo-count"><i class="fa-solid fa-camera"></i> ${album.photos.length} photo${album.photos.length===1?"":"s"}</span>
      </div>
      <div class="album-info">
        <div class="album-date">${album.date}</div>
        <h3>${album.title}</h3>
        <p class="album-result">${album.result}</p>
        <button class="album-open" data-album="${index}" ${hasPhotos?"":"disabled"}>${hasPhotos?"VIEW ALBUM":"PHOTOS COMING SOON"}</button>
      </div>`;
    grid.appendChild(card);
  });

  timeline.insertAdjacentElement("afterend",section);

  const lightbox=document.createElement("div");
  lightbox.className="album-lightbox";
  lightbox.setAttribute("aria-hidden","true");
  lightbox.innerHTML=`
    <button class="album-lightbox-close" aria-label="Close photo">&times;</button>
    <button class="album-lightbox-nav album-lightbox-prev" aria-label="Previous photo"><i class="fa-solid fa-chevron-left"></i></button>
    <img src="" alt="Blue Rose tournament photo">
    <button class="album-lightbox-nav album-lightbox-next" aria-label="Next photo"><i class="fa-solid fa-chevron-right"></i></button>`;
  document.body.appendChild(lightbox);

  let activeAlbum=[];
  let activePhoto=0;
  const lightboxImage=lightbox.querySelector("img");
  const showPhoto=()=>{lightboxImage.src=activeAlbum[activePhoto];};
  const closeLightbox=()=>{lightbox.classList.remove("active");lightbox.setAttribute("aria-hidden","true");document.body.style.overflow="auto";};

  grid.addEventListener("click",(event)=>{
    const button=event.target.closest(".album-open");
    if(!button||button.disabled)return;
    activeAlbum=tournamentAlbums[Number(button.dataset.album)].photos;
    activePhoto=0;
    showPhoto();
    lightbox.classList.add("active");
    lightbox.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
  });

  lightbox.querySelector(".album-lightbox-close").addEventListener("click",closeLightbox);
  lightbox.querySelector(".album-lightbox-prev").addEventListener("click",()=>{activePhoto=(activePhoto-1+activeAlbum.length)%activeAlbum.length;showPhoto();});
  lightbox.querySelector(".album-lightbox-next").addEventListener("click",()=>{activePhoto=(activePhoto+1)%activeAlbum.length;showPhoto();});
  lightbox.addEventListener("click",(event)=>{if(event.target===lightbox)closeLightbox();});
  document.addEventListener("keydown",(event)=>{
    if(!lightbox.classList.contains("active"))return;
    if(event.key==="Escape")closeLightbox();
    if(event.key==="ArrowLeft"){activePhoto=(activePhoto-1+activeAlbum.length)%activeAlbum.length;showPhoto();}
    if(event.key==="ArrowRight"){activePhoto=(activePhoto+1)%activeAlbum.length;showPhoto();}
  });
}

buildJourneyAlbums();