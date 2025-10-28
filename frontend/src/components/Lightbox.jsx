import React, { useEffect } from 'react'

export default function Lightbox({ open, images, index = 0, onClose }) {
  const [i, setI] = React.useState(index)
  useEffect(() => { setI(index) }, [index])
  if (!open) return null
  const img = images?.[i]
  function prev() { setI((i - 1 + images.length) % images.length) }
  function next() { setI((i + 1) % images.length) }
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <button className="absolute top-4 right-4 px-3 py-1 bg-white/90 rounded text-sm" onClick={onClose}>Close</button>
      <div className="max-w-[90vw] max-h-[80vh] flex flex-col items-center gap-2">
        {img ? <img src={img} alt="" className="max-w-full max-h-[70vh] object-contain rounded shadow" /> : null}
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 bg-white/90 rounded text-sm" onClick={prev}>Prev</button>
          <div className="text-white text-sm">{i + 1} / {images?.length || 0}</div>
          <button className="px-3 py-1 bg-white/90 rounded text-sm" onClick={next}>Next</button>
        </div>
      </div>
    </div>
  )
}
