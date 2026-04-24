'use client';

export function printPhotoStrip(imageUrl: string) {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1200');
  if (!popup) {
    throw new Error('Popup blocked. Izinkan pop-up browser untuk mencetak photostrip.');
  }

  popup.document.open();
  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>KoGraph Studio Print</title>
        <style>
          @page {
            size: 105mm 297mm;
            margin: 0;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 105mm;
            height: 297mm;
            background: #ffffff;
          }
          body {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          img {
            width: 105mm;
            height: 297mm;
            object-fit: contain;
            display: block;
          }
        </style>
      </head>
      <body>
        <img src="${imageUrl}" alt="KoGraph Studio photostrip" />
        <script>
          window.onload = () => {
            setTimeout(() => window.print(), 180);
          };
        </script>
      </body>
    </html>
  `);
  popup.document.close();
}
