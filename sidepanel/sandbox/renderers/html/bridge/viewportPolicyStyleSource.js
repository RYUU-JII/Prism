export const VIEWPORT_POLICY_STYLE_SOURCE = String.raw`
      html, body {
        max-width: 100%;
        overflow-x: hidden !important;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      html::-webkit-scrollbar,
      body::-webkit-scrollbar {
        width: 0;
        height: 0;
      }
      canvas, img, video, svg {
        max-width: 100%;
      }
`;
