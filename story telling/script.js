// Select all cards
const cards = document.querySelectorAll('.card');
const videoPlayer = document.getElementById('storyVideo');

cards.forEach(card => {
    card.addEventListener('click', () => {
        const videoSrc = card.getAttribute('data-video');
        videoPlayer.src = videoSrc;
        videoPlayer.play();
        videoPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
});
