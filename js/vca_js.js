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

    pastorVideoPoster.hidden = true;
    pastorYoutubeVideo.hidden = false;
    pastorIframe.src = videoSrc;
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
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  // Use the local calendar date to advance exactly once per day. Converting
  // its date parts to UTC avoids skipped or repeated indexes caused by time
  // zones and daylight-saving changes.
  const dayNumber = Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) /
      millisecondsPerDay
  );
  const verseIndex = dayNumber % dailyVerses.length;

  verseText.textContent = `"${dailyVerses[verseIndex].text}"`;
  verseRef.textContent = dailyVerses[verseIndex].reference;
}


/* ================================
   HOMEPAGE HERO
================================ */

const landingHero = document.querySelector(
  ".landing-hero, .landing-style-hero"
);

const heroVideos = Array.from(
  document.querySelectorAll(".hero-video")
);

const heroScrollIndicator = document.querySelector(
  ".hero-scroll-indicator"
);

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

let heroVideoIndex = 0;
let heroVideoTimer = null;
let isHeroVisible = true;
let isHeroSequenceRunning = false;
let autoplayFailed = false;


/* ================================
   HERO SCROLL INDICATOR
================================ */

if (heroScrollIndicator) {
  let isHeroScrollIndicatorHidden;

  function updateHeroScrollIndicator() {
    const shouldHide = window.scrollY > 75;

    if (shouldHide === isHeroScrollIndicatorHidden) return;

    heroScrollIndicator.classList.toggle(
      "is-hidden",
      shouldHide
    );

    isHeroScrollIndicatorHidden = shouldHide;
  }

  updateHeroScrollIndicator();

  window.addEventListener(
    "scroll",
    updateHeroScrollIndicator,
    { passive: true }
  );
}


/* ================================
   HERO VIDEO HELPERS
================================ */

function getHeroVideoDuration(index) {
  const video = heroVideos[index];

  if (!video) {
    return 3000;
  }

  if (Number.isFinite(video.duration) && video.duration > 0) {
    const remainingDuration = video.duration - video.currentTime;

    return Math.max(remainingDuration * 1000, 100);
  }

  // Used only if the browser cannot read the video's metadata.
  return 3000;
}


function clearHeroVideoTimer() {
  if (heroVideoTimer !== null) {
    clearTimeout(heroVideoTimer);
    heroVideoTimer = null;
  }
}


function pauseHeroVideos() {
  heroVideos.forEach((video) => {
    if (video.tagName === "VIDEO") {
      video.pause();
    }
  });
}


function showChurchImage() {
  if (!landingHero) return;

  landingHero.classList.remove("show-video");

  heroVideos.forEach((video) => {
    video.classList.remove("active-video");

    if (video.tagName === "VIDEO") {
      video.pause();
    }
  });
}


/* ================================
   HERO VIDEO SEQUENCE
================================ */

async function showHeroVideo(index, restartVideo = true) {
  const currentVideo = heroVideos[index];

  if (!landingHero || !currentVideo) {
    return false;
  }

  heroVideos.forEach((video, videoIndex) => {
    const isCurrentVideo = videoIndex === index;

    video.classList.toggle(
      "active-video",
      isCurrentVideo
    );

    if (
      video.tagName === "VIDEO" &&
      !isCurrentVideo
    ) {
      video.pause();
    }
  });

  if (currentVideo.tagName !== "VIDEO") {
    landingHero.classList.add("show-video");
    return true;
  }

  currentVideo.muted = true;
  currentVideo.defaultMuted = true;
  currentVideo.playsInline = true;
  currentVideo.loop = true;

  if (restartVideo) {
    try {
      currentVideo.currentTime = 0;
    } catch (error) {
      // Some browsers may block currentTime changes
      // until the video metadata has loaded.
    }
  }

  try {
    await currentVideo.play();

    autoplayFailed = false;
    landingHero.classList.add("show-video");

    return true;
  } catch (error) {
    autoplayFailed = true;
    showChurchImage();

    return false;
  }
}


function scheduleNextHeroVideo() {
  clearHeroVideoTimer();

  if (
    !isHeroSequenceRunning ||
    !isHeroVisible ||
    document.hidden ||
    prefersReducedMotion.matches ||
    autoplayFailed
  ) {
    return;
  }

  const currentDuration =
    getHeroVideoDuration(heroVideoIndex);

  heroVideoTimer = setTimeout(async () => {
    heroVideoIndex =
      (heroVideoIndex + 1) % heroVideos.length;

    const videoStarted = await showHeroVideo(
      heroVideoIndex,
      true
    );

    if (videoStarted) {
      scheduleNextHeroVideo();
    }
  }, currentDuration);
}


async function startHeroVideos({
  restartCurrentVideo = false
} = {}) {
  if (
    !landingHero ||
    heroVideos.length === 0 ||
    prefersReducedMotion.matches ||
    document.hidden ||
    !isHeroVisible
  ) {
    return;
  }

  isHeroSequenceRunning = true;
  autoplayFailed = false;

  const videoStarted = await showHeroVideo(
    heroVideoIndex,
    restartCurrentVideo
  );

  if (videoStarted) {
    scheduleNextHeroVideo();
  }
}


function pauseHeroVideoSequence() {
  isHeroSequenceRunning = false;

  clearHeroVideoTimer();
  pauseHeroVideos();
}


function resumeHeroVideoSequence() {
  if (
    !landingHero ||
    heroVideos.length === 0 ||
    prefersReducedMotion.matches ||
    document.hidden ||
    !isHeroVisible
  ) {
    return;
  }

  startHeroVideos({
    restartCurrentVideo: false
  });
}


/* ================================
   VIEWPORT VISIBILITY
================================ */

if (
  landingHero &&
  heroVideos.length > 0 &&
  "IntersectionObserver" in window
) {
  const heroObserver = new IntersectionObserver(
    (entries) => {
      const heroEntry = entries[0];

      isHeroVisible = heroEntry.isIntersecting;

      if (isHeroVisible) {
        resumeHeroVideoSequence();
      } else {
        pauseHeroVideoSequence();
      }
    },
    {
      threshold: 0
    }
  );

  heroObserver.observe(landingHero);
}


/* ================================
   BROWSER TAB VISIBILITY
================================ */

document.addEventListener(
  "visibilitychange",
  () => {
    if (document.hidden) {
      pauseHeroVideoSequence();
    } else {
      resumeHeroVideoSequence();
    }
  }
);


/* ================================
   REDUCED MOTION
================================ */

function handleReducedMotionChange(event) {
  if (event.matches) {
    pauseHeroVideoSequence();
    showChurchImage();
  } else {
    autoplayFailed = false;

    startHeroVideos({
      restartCurrentVideo: true
    });
  }
}

if (
  typeof prefersReducedMotion.addEventListener ===
  "function"
) {
  prefersReducedMotion.addEventListener(
    "change",
    handleReducedMotionChange
  );
} else {
  prefersReducedMotion.addListener(
    handleReducedMotionChange
  );
}


/* ================================
   INITIALIZE HERO
================================ */

if (landingHero && heroVideos.length > 0) {
  heroVideos.forEach((video) => {
    if (video.tagName === "VIDEO") {
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.loop = true;
    }
  });

  showChurchImage();

  if (!prefersReducedMotion.matches) {
    startHeroVideos({
      restartCurrentVideo: true
    });
  }
}

/* ================================
   ABOUT HERO VIDEO
   Performance Enhancement
================================ */

const aboutHero = document.querySelector(".about-hero");
const aboutHeroVideo = document.querySelector(".about-hero-video");

if (aboutHero && aboutHeroVideo) {
  const aboutPrefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  let isAboutHeroVisible = true;

  async function playAboutHeroVideo() {
    if (
      document.hidden ||
      !isAboutHeroVisible ||
      aboutPrefersReducedMotion.matches
    ) {
      return;
    }

    try {
      await aboutHeroVideo.play();
      aboutHero.classList.remove("about-hero-autoplay-failed");
    } catch (error) {
      aboutHero.classList.add("about-hero-autoplay-failed");
    }
  }

  function pauseAboutHeroVideo() {
    aboutHeroVideo.pause();
  }

  // Pause when the browser tab is hidden.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseAboutHeroVideo();
    } else {
      playAboutHeroVideo();
    }
  });

  // Pause when the hero leaves the viewport.
  if ("IntersectionObserver" in window) {
    const aboutHeroObserver = new IntersectionObserver(
      ([entry]) => {
        isAboutHeroVisible = entry.isIntersecting;

        if (isAboutHeroVisible) {
          playAboutHeroVideo();
        } else {
          pauseAboutHeroVideo();
        }
      },
      {
        threshold: 0.15
      }
    );

    aboutHeroObserver.observe(aboutHero);
  }

  // Respect prefers-reduced-motion.
  function handleAboutReducedMotion(event) {
    if (event.matches) {
      pauseAboutHeroVideo();
    } else {
      playAboutHeroVideo();
    }
  }

  if (
    typeof aboutPrefersReducedMotion.addEventListener ===
    "function"
  ) {
    aboutPrefersReducedMotion.addEventListener(
      "change",
      handleAboutReducedMotion
    );
  } else {
    aboutPrefersReducedMotion.addListener(
      handleAboutReducedMotion
    );
  }

  if (aboutPrefersReducedMotion.matches) {
    pauseAboutHeroVideo();
  } else {
    playAboutHeroVideo();
  }
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

