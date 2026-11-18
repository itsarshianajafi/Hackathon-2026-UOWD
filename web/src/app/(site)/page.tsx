import ButtonFx from "./components/ButtonFx";
import Hero from "./components/Hero";
import Nav from "./components/Nav";
import Reveals from "./components/Reveals";
import Services from "./components/Services";
import SmoothScroll from "./components/SmoothScroll";
import Testimonials from "./components/Testimonials";
import { Blog, Career, Chevrons, Cta, Footer, Intro, Steps, Support } from "./components/Sections";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Nav />
      <main>
        <Hero />
        <Intro />
        <Chevrons />
        <Steps />
        <Career />
        <Testimonials />
        <Services />
        <Support />
        <Blog />
        <Cta />
      </main>
      <Footer />
      {/* Must stay last: measures after the hero pin has been created. */}
      <Reveals />
      <ButtonFx />
    </>
  );
}
