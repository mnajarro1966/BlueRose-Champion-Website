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
sponsorForm.addEventListener("submit",(e)=>{e.preventDefault();const data=new FormData(sponsorForm);const subject=encodeURIComponent("Blue Rose Sponsorship Inquiry");const body=encodeURIComponent(`Name: ${data.get("name")}\nBusiness / Organization: ${data.get("business")||"N/A"}\nEmail: ${data.get("email")}\nPhone: ${data.get("phone")||"N/A"}\n\nSponsorship message:\n${data.get("message")}`);window.location.href=`mailto:bluerosenajarro@gmail.com?subject=${subject}&body=${body}`;});