// Render tanda tangan tersimpan: "txt:<nama>" = tanda tangan digital (teks),
// selain itu = gambar data URL hasil coretan kanvas.
export default function SignatureDisplay({ value }: { value: string }) {
  if (value.startsWith("txt:")) {
    return <span className="sig-typed">{value.slice(4)}</span>;
  }
  return <img src={value} alt="tanda tangan" />;
}
