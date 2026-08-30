import { Show } from "@clerk/nextjs";

import { MarketingFooter, MarketingHeader } from "../components/app-shell";
import {
  benefitItems,
  demoCampaign,
  formatRupees,
  selectedProvider,
  testimonials,
  trustItems,
  venueChips,
  workflow
} from "../components/demo-data";
import { Icon } from "../components/icons";
import { Badge, ButtonLink } from "../components/ui";

export default function Home() {
  return (
    <div className="marketing-page">
      <MarketingHeader />
      <main>
        <section className="landing-hero" id="product">
          <div className="hero-copy">
            <h1>Fill quiet slots.<br />Recover <span>real revenue.</span></h1>
            <p>An AI agent that finds empty capacity, launches promotions, and turns it into measurable revenue.</p>
            <div className="hero-actions">
              <Show when="signed-out">
                <ButtonLink href="/sign-in?redirect_url=%2Fdashboard">Get Started <Icon name="arrow" /></ButtonLink>
              </Show>
              <Show when="signed-in">
                <ButtonLink href="/dashboard">Get Started <Icon name="arrow" /></ButtonLink>
              </Show>
            </div>
          </div>
          <div className="hero-product-preview">
            <div className="hero-contour" aria-hidden="true"><span /><span /><span /><span /></div>
            <section className="execution-card card">
              <div className="execution-head">
                <span className="execution-photo" />
                <span><strong>{demoCampaign.spot}</strong><small>{demoCampaign.location}</small></span>
                <Badge tone="success" dot>Active</Badge>
              </div>
              <div className="execution-date"><Icon name="calendar" /><span>{demoCampaign.displayDate}<small>Friday, 7–9 PM</small></span></div>
              <div className="execution-metrics"><span><small>Unused Seats</small><strong>12</strong></span><span><small>Target Reservations</small><strong>6</strong></span><span><small>Budget</small><strong>₹5,000</strong></span></div>
              <div className="execution-grid">
                <div className="agent-status"><small>Agent Status</small>{["Intent received", "Providers discovered", "Provider evidence verified", "Best package selected"].map((item) => <span key={item}><i><Icon name="check" /></i>{item}</span>)}<strong><Icon name="clock" /> Awaiting Approval</strong></div>
                <div className="selected-package"><small>Selected Package</small><span className="package-photo" /><strong>{selectedProvider.provider}</strong><span>{selectedProvider.package}</span><b>{formatRupees(selectedProvider.pricePaise)}</b><em>Expected: {selectedProvider.expectedBookings} bookings</em></div>
              </div>
            </section>
          </div>
        </section>

        <section className="trust-strip" aria-label="Product safeguards">
          {trustItems.map((item) => <div key={item.title}><span><Icon name={item.icon} /></span><p><strong>{item.title}</strong><small>{item.detail}</small></p></div>)}
        </section>

        <section className="landing-section how-section" id="how-it-works">
          <header><h2>How Reverb works</h2><p>Each step stays connected, controlled, and visible from request to result.</p></header>
          <ol className="landing-workflow">
            {workflow.map((step, index) => <li key={step}><span><Icon name={workflowIcons[index]} /></span><strong>{step}</strong><small>{workflowDetails[index]}</small></li>)}
          </ol>
        </section>

        <section className="landing-section value-section" id="results">
          <div className="demo-metric-row">
            <span><strong className="positive">+33%</strong><small>Capacity Recovered</small><em>Demo figure</em></span>
            <span><strong className="blue">-27%</strong><small>CPA Improvement</small><em>Demo figure</em></span>
            <span><strong>₹42.6K</strong><small>Revenue Recovered</small><em>Demo figure</em></span>
            <span><strong>92%</strong><small>Reservation Success</small><em>Demo figure</em></span>
          </div>
          <header><h2>Why venues love Reverb</h2></header>
          <div className="benefit-grid">
            {benefitItems.map((item) => <article key={item.title}><span><Icon name={item.icon} /></span><h3>{item.title}</h3><p>{item.detail}</p></article>)}
          </div>
        </section>

        <section className="landing-section testimonials-section">
          <header><h2>Trusted by demo venues & providers</h2></header>
          <div className="venue-chip-row">{venueChips.map((venue) => <span key={venue}><i>{venue.slice(0, 1)}</i>{venue}</span>)}</div>
          <div className="testimonial-grid">
            {testimonials.map((testimonial) => <article className={testimonial.featured ? "featured" : ""} key={testimonial.name}><div className="testimonial-person"><span>{testimonial.initials}</span><p><strong>{testimonial.name}</strong><small>{testimonial.role}</small></p></div><blockquote>“{testimonial.quote}”</blockquote><em>{testimonial.result}</em></article>)}
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

const workflowIcons = ["review", "search", "spark", "edit", "approval", "store", "reservation"] as const;
const workflowDetails = ["Set the goal", "Check evidence", "Score options", "Review campaign", "Owner confirms", "Provider activates", "Track outcomes"];
