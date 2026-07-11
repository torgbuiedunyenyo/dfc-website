(function () {
  "use strict";

  function initializeImageLightbox() {
    var projectImages = Array.prototype.slice.call(
      document.querySelectorAll("main img")
    );

    if (!projectImages.length) {
      return;
    }

    var previouslyFocused = null;
    var lightbox = document.createElement("div");
    lightbox.className = "image-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Full-size image viewer");
    lightbox.hidden = true;

    var modalImage = document.createElement("img");
    modalImage.className = "image-lightbox__image";

    var closeButton = document.createElement("button");
    closeButton.className = "image-lightbox__close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close full-size image");
    closeButton.textContent = "×";

    lightbox.appendChild(modalImage);
    lightbox.appendChild(closeButton);
    document.body.appendChild(lightbox);

    function openLightbox(sourceImage) {
      previouslyFocused = document.activeElement;
      modalImage.src = sourceImage.currentSrc || sourceImage.src;
      modalImage.alt = sourceImage.alt || "";
      lightbox.hidden = false;
      document.body.classList.add("lightbox-open");
      closeButton.focus();
    }

    function closeLightbox() {
      if (lightbox.hidden) {
        return;
      }

      lightbox.hidden = true;
      modalImage.removeAttribute("src");
      modalImage.alt = "";
      document.body.classList.remove("lightbox-open");

      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    }

    projectImages.forEach(function (image) {
      image.classList.add("image-lightbox-trigger");
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-haspopup", "dialog");
      image.setAttribute(
        "aria-label",
        "View full-size " + (image.alt || "project image")
      );

      image.addEventListener("click", function (event) {
        event.preventDefault();
        openLightbox(image);
      });

      image.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLightbox(image);
        }
      });
    });

    closeButton.addEventListener("click", closeLightbox);

    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) {
        closeLightbox();
      }
    });

    lightbox.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeLightbox();
      } else if (event.key === "Tab") {
        event.preventDefault();
        closeButton.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeImageLightbox);
  } else {
    initializeImageLightbox();
  }
})();
