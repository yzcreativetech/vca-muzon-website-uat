/* ANNOUNCEMENT CAROUSEL */

const slides = document.querySelectorAll(".announcement-slide");
const dotsContainer = document.querySelector(".carousel-dots");
const counter = document.querySelector(".carousel-counter");
const progressBar = document.querySelector(".progress-bar");
const prevBtn = document.querySelector(".prev-btn");
const nextBtn = document.querySelector(".next-btn");
const carousel = document.querySelector(".announcement-carousel");
const announcementSection = carousel?.closest(".announcement-section");

let currentSlide = 0;
let slideInterval;
let touchStartX = 0;
let touchEndX = 0;
let slideTransitionTimeout;
const slideTransitionDuration = 800;

function formatNumber(number) {
  return String(number).padStart(2, "0");
}

function createDots() {
  if (!dotsContainer || slides.length === 0) return;

  dotsContainer.innerHTML = "";

  slides.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.classList.add("dot");
    dot.setAttribute("aria-label", `Go to slide ${index + 1}`);

    if (index === 0) {
      dot.classList.add("active");
    }

    dot.addEventListener("click", () => {
      showSlide(index);
      resetAutoSlide();
    });

    dotsContainer.appendChild(dot);
  });
}

function updateCounter() {
  if (!counter) return;

  counter.textContent = `${formatNumber(currentSlide + 1)} / ${formatNumber(slides.length)}`;
}

function updateProgressBar() {
  if (!progressBar || slides.length === 0) return;

  progressBar.style.width = `${((currentSlide + 1) / slides.length) * 100}%`;
}

function animateCounter() {
  if (!counter || typeof counter.animate !== "function") return;

  counter.animate(
    [
      {
        opacity: 0.2,
        transform: "translateY(6px)"
      },
      {
        opacity: 1,
        transform: "translateY(0)"
      }
    ],
    {
      duration: 300
    }
  );
}

function updateKenBurnsState() {
  slides.forEach((slide) => {
    const image = slide.querySelector(".announcement-image");

    if (!image) return;

    image.style.animationPlayState = slide.classList.contains("active") ? "running" : "paused";
  });
}

function setCarouselChangingState() {
  if (!announcementSection) return;

  announcementSection.classList.add("is-changing");
  clearTimeout(slideTransitionTimeout);

  slideTransitionTimeout = setTimeout(() => {
    announcementSection.classList.remove("is-changing");
  }, slideTransitionDuration);
}

function showSlide(index) {
  const dots = document.querySelectorAll(".dot");

  if (!slides[index]) return;

  if (index === currentSlide && slides[index].classList.contains("active")) {
    updateCounter();
    updateProgressBar();
    updateKenBurnsState();
    return;
  }

  setCarouselChangingState();

  slides.forEach((slide) => {
    slide.classList.remove("active");
  });

  dots.forEach((dot) => {
    dot.classList.remove("active");
  });

  slides[index].classList.add("active");

  if (dots[index]) {
    dots[index].classList.add("active");
  }

  currentSlide = index;
  updateCounter();
  animateCounter();
  updateProgressBar();
  updateKenBurnsState();
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
  stopAutoSlide();
  slideInterval = setInterval(nextSlide, 6500);
}

function stopAutoSlide() {
  clearInterval(slideInterval);
}

function resetAutoSlide() {
  stopAutoSlide();
  startAutoSlide();
}

if (slides.length > 0 && dotsContainer && counter && prevBtn && nextBtn && carousel) {
  createDots();
  showSlide(0);
  startAutoSlide();

  nextBtn.addEventListener("click", () => {
    nextSlide();
    resetAutoSlide();
  });

  prevBtn.addEventListener("click", () => {
    prevSlide();
    resetAutoSlide();
  });

  carousel.addEventListener("mouseenter", stopAutoSlide);
  carousel.addEventListener("mouseleave", startAutoSlide);

  carousel.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].screenX;
  });

  carousel.addEventListener("touchend", (event) => {
    touchEndX = event.changedTouches[0].screenX;

    if (touchStartX - touchEndX > 50) {
      nextSlide();
      resetAutoSlide();
    }

    if (touchEndX - touchStartX > 50) {
      prevSlide();
      resetAutoSlide();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      nextSlide();
      resetAutoSlide();
    }

    if (event.key === "ArrowLeft") {
      prevSlide();
      resetAutoSlide();
    }
  });
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

/* ================================
   PASTOR WELCOME VIDEO
================================ */

const pastorVideoPoster = document.querySelector(".pastor-video-poster");
const pastorYoutubeVideo = document.querySelector(".pastor-youtube-video");
const pastorIframe = document.querySelector(".pastor-youtube-video iframe");

if (pastorVideoPoster && pastorYoutubeVideo && pastorIframe) {
  pastorVideoPoster.addEventListener("click", () => {
    const videoSrc = pastorIframe.dataset.videoSrc;

    pastorIframe.src = videoSrc;
    pastorVideoPoster.hidden = true;
    pastorYoutubeVideo.hidden = false;
  });
}

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
    currentVideo.muted = true;
    currentVideo.playsInline = true;
    currentVideo.currentTime = 0;
    currentVideo.play().catch(() => {});
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

// Scroll reveal animation for story sections/

const revealElements = document.querySelectorAll(".reveal-on-scroll");

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if(entry.isIntersecting) {
        entry.target.classList.add("revealed");
      }
    });
  },
  {
    threshold: 0.18,
  }
);

revealElements.forEach((element) => {
  revealObserver.observe(element);
})

