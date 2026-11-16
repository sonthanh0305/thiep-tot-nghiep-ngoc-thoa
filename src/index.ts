import { InvitationWebOverlay } from './ui/InvitationWebOverlay';

function startGraduationApp(): void {
  new InvitationWebOverlay();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    startGraduationApp();
  });
} else {
  startGraduationApp();
}
