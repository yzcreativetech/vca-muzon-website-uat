const slides = document.querySelectorAll(".announcement-slide");
const dots = document.querySelectorAll(".dot");
const prevBtn = document.querySelector(".prev-btn");
const nextBtn = document.querySelector(".next-btn");

let currentSlide = 0;
let slideInterval;

function showSlide(index) {
  slides.forEach((slide) => {
    slide.classList.remove("active");
  });

  dots.forEach((dot) => {
    dot.classList.remove("active");
  });

  slides[index].classList.add("active");
  dots[index].classList.add("active");

  currentSlide = index;
}

function nextSlide() {
  let nextIndex = currentSlide + 1;

  if (nextIndex >= slides.length) {
    nextIndex = 0;
  }

  showSlide(nextIndex);
}

function prevSlide() {
  let prevIndex = currentSlide - 1;

  if (prevIndex < 0) {
    prevIndex = slides.length - 1;
  }

  showSlide(prevIndex);
}

function startAutoSlide() {
  slideInterval = setInterval(nextSlide, 5000);
}

function stopAutoSlide() {
  clearInterval(slideInterval);
}

if (slides.length > 0 && dots.length > 0 && prevBtn && nextBtn) {
  nextBtn.addEventListener("click", () => {
    nextSlide();
    stopAutoSlide();
    startAutoSlide();
  });

  prevBtn.addEventListener("click", () => {
    prevSlide();
    stopAutoSlide();
    startAutoSlide();
  });

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showSlide(index);
      stopAutoSlide();
      startAutoSlide();
    });
  });

  startAutoSlide();
}
/* PAGE TRANSITION */

const pageLinks = document.querySelectorAll("a[href]");

pageLinks.forEach((link) => {
  const href = link.getAttribute("href");

  if (
    href &&
    !href.startsWith("#") &&
    !href.startsWith("http") &&
    !href.startsWith("mailto") &&
    !href.startsWith("tel")
  ) {
    link.addEventListener("click", function (event) {
      event.preventDefault();

      document.body.classList.add("page-fade-out");

      setTimeout(() => {
        window.location.href=href;
      }, 200);
    })
  }
})

/* DAILY VERSE */

const dailyVerses = [
  {
    text: "Trust in the Lord with all your heart and lean not on your own understanding.",
    reference: "Proverbs 3:5-6"
  },
  {
    text: "Your word is a lamp to my feet and a light to my path.",
    reference: "Psalm 119:105"
  },
  {
    text: "I can do all things through Christ who strengthens me.",
    reference: "Philippians 4:13"
  },
  {
    text: "The Lord is my shepherd; I shall not want.",
    reference: "Psalm 23:1"
  },
  {
    text: "Be still, and know that I am God.",
    reference: "Psalm 46:10"
  },
  {
    text: "Seek first the kingdom of God and His righteousness.",
    reference: "Matthew 6:33"
  },
  {
    text: "Cast all your anxiety on Him because He cares for you.",
    reference: "1 Peter 5:7"
  },
  {
    text: "The joy of the Lord is your strength.",
    reference: "Nehemiah 8:10"
  },
  {
    text: "Walk by faith, not by sight.",
    reference: "2 Corinthians 5:7"
  },
  {
    text: "Let everything that has breath praise the Lord.",
    reference: "Psalm 150:6"
  }
];

const verseText = document.getElementById("dailyVerseText");
const verseRef = document.getElementById("dailyVerseRef");

if (verseText && verseRef) {
  const today = new Date();
  const dayNumber = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
  const verseIndex = dayNumber % dailyVerses.length;

  verseText.textContent = `"${dailyVerses[verseIndex].text}"`;
  verseRef.textContent = dailyVerses[verseIndex].reference;
}


/* INDEX LANDING BACKGROUND */

const landingHero = document.querySelector(".landing-hero, .landing-style-hero");
const heroVideos = document.querySelectorAll(".hero-video");

let heroVideoIndex = 0;
let heroIdleTimer;
let heroVideoTimer;

function showChurchImage() {
  if (!landingHero) return;

  landingHero.classList.remove("show-video");

  clearInterval(heroVideoTimer);
}

function showHeroVideo(index) {
  heroVideos.forEach((video) => {
    video.classList.remove("active-video");

    if (video.tagName === "VIDEO") {
      video.pause();
    }
  });

  const currentVideo = heroVideos[index];
  currentVideo.classList.add("active-video");

  if (currentVideo.tagName === "VIDEO") {
    currentVideo.currentTime = 0;
    currentVideo.play();
  }
}

function startHeroVideos() {
  if (!landingHero || heroVideos.length === 0) return;

  landingHero.classList.add("show-video");

  heroVideoIndex = 0;
  showHeroVideo(heroVideoIndex);

  clearInterval(heroVideoTimer);

  heroVideoTimer = setInterval(() => {
    heroVideoIndex++;

    if (heroVideoIndex >= heroVideos.length) {
      heroVideoIndex = 0;
    }

    showHeroVideo(heroVideoIndex);
  }, 8000);
}

function resetHeroIdleTimer() {
  if (!landingHero || heroVideos.length === 0) return;

  clearTimeout(heroIdleTimer);

  showChurchImage();

  heroIdleTimer = setTimeout(() => {
    startHeroVideos();
  }, 5000);
}

if (landingHero && heroVideos.length > 0) {
  showChurchImage();

  heroIdleTimer = setTimeout(() => {
    startHeroVideos();
  }, 5000);

  landingHero.addEventListener("mousemove", resetHeroIdleTimer);
  landingHero.addEventListener("touchstart", resetHeroIdleTimer);
  landingHero.addEventListener("keydown", resetHeroIdleTimer);
}

/* FIX WHITE SCREEN WHEN USING BACK BUTTON */

window.addEventListener("pageshow", () => {
  document.body.classList.remove("page-fade-out");
});