import c1 from "@/assets/coffee-1.jpg";
import c2 from "@/assets/coffee-2.jpg";
import c3 from "@/assets/coffee-3.jpg";
import c4 from "@/assets/coffee-4.jpg";
import c5 from "@/assets/coffee-5.jpg";
import c6 from "@/assets/coffee-6.jpg";

const imgs = [c1, c2, c3, c4, c5, c6];

export const CoffeeMarquee = () => (
  <section className="bg-cream py-16 sm:py-20">
    <div className="reveal marquee-pause overflow-hidden">
      <div className="marquee-track flex w-max gap-5">
        {[...imgs, ...imgs].map((src, i) => (
          <div
            key={i}
            className="relative h-56 w-72 shrink-0 overflow-hidden rounded-2xl shadow-soft sm:h-72 sm:w-96"
          >
            <img
              src={src}
              alt=""
              loading="lazy"
              aria-hidden
              className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
            />
          </div>
        ))}
      </div>
    </div>
  </section>
);
