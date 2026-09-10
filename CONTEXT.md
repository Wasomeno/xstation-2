# XTATION

The public station site: a landing page for XTATION products that a visitor can speak to, and that can move them to a section of the page they asked for.

## Language

**Visitor**:
A person on the live site, on a phone or a desktop, not only the developer on localhost.
_Avoid_: user, operator, customer

**Session**:
The period from when the visitor turns the floating mic on until they turn it off. Several commands can happen inside one session.
_Avoid_: conversation, call, recording

**Command**:
One open-ended spoken request inside a session. Bahasa Indonesia is primary; English is still understood. It is not a keyword or a section id. Partial text can appear in the Voice Surface while the visitor talks; the Command is complete after a Pause.
_Avoid_: utterance, prompt, query, message, partial

**Pause**:
The silence that ends a Command inside a Session. Same handle on phone and desktop: there is no hold-to-talk and no send control.
_Avoid_: endpointing, VAD, timeout, stop, hold, send

**Section**:
A named landmark on the station page (`hero`, `system`, `work`, product spaces, `clients`, `contact`).
_Avoid_: page, screen, block, chapter

**Voice Surface**:
The floating mic the visitor taps to start or end a session.
_Avoid_: widget, chatbot, overlay, FAB

**Station Agent**:
The in-page driver that turns a Command into a Page Action on the opened tab. It knows the Sections and their capabilities. It is not a generic browser-use robot, and it does not give spoken or written product answers. “What is Arkiv?” is a Show of Arkiv. A business problem or recommendation request also selects one best matching Section without requiring its name. When several products could help, choose the best initial recommendation; specific needs take priority over general goals. General promotion or sales growth starts at BikinKonten, marketing through chat to publication selects Lubna, and unanswered customer messages select CRM AI Agent. One Command yields at most one Page Action.
_Avoid_: main agent, browser agent, copilot, chatbot, guide

**Show**:
Scrolling a Section into view along the site's existing smooth scroll, then a short highlight on that Section.
_Avoid_: jump, open, navigate, hash

**Page Action**:
A Show, back through the in-memory action log at its active index, next Section in full page order from the visible Section, exploration of the next Section, or focus on a Contact CTA. Next proceeds from Hero to System, Products, each product, Clients, and Contact, where it stops. Next records a Show; new actions replace forward history after going back. Contact requests focus the named/current product's CTA or the general Contact Section; opening WhatsApp requires an explicit request and never sends a message. Video demo commands are excluded. All actions use the page's catalog and existing elements.
_Avoid_: tool call, generic browser control, fill, mailto, answer

**Clarification**:
An unresolved decision when a reference or incomplete Command cannot be interpreted. Several relevant products alone do not require Clarification: the Station Agent selects the best one. A Clarification never automatically becomes a Show of its first Hypothesis. The current Voice Surface signals no action and keeps the Session open without displaying a question. Greetings, unsupported needs, and refusals without an alternative produce no action.
_Avoid_: error, fallback, retry, sorry

**Hypothesis**:
The Station Agent's best guess at the Section a Command meant.
_Avoid_: suggestion, option, candidate
