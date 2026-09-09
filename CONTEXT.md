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
One open-ended spoken request inside a session, in English or Indonesian. It is not a keyword or a section id. The transcript appears only after a Pause, as a whole sentence — not word-by-word while the visitor talks.
_Avoid_: utterance, prompt, query, message, partial

**Pause**:
The silence that ends a Command inside a Session. Same handle on phone and desktop: there is no hold-to-talk and no send control.
_Avoid_: endpointing, VAD, timeout, stop, hold, send

**Section**:
A named landmark on the station page (`hero`, `work`, product spaces, `clients`, `contact`).
_Avoid_: page, screen, block, chapter

**Voice Surface**:
The floating mic the visitor taps to start or end a session.
_Avoid_: widget, chatbot, overlay, FAB

**Station Agent**:
The in-page driver that turns a Command into a Page Action on the opened tab, or asks a Clarification. It knows the Sections. It is not a generic browser-use robot, and it does not answer questions. “What is Arkiv?” is a Show of Arkiv. One Command yields one Page Action, and only when there is a single clear Hypothesis.
_Avoid_: main agent, browser agent, copilot, chatbot, guide

**Show**:
Scrolling a Section into view along the site's existing smooth scroll, then a short highlight on that Section.
_Avoid_: jump, open, navigate, hash

**Page Action**:
A Show. Contact is a Section (the QR), not a form to fill. No other hands in this experience.
_Avoid_: tool call, control, navigation, click, fill, mailto, answer

**Clarification**:
What the Station Agent asks when a Command has zero or several Hypotheses. It names the Hypotheses. No Page Action that turn. The Session stays open.
_Avoid_: error, fallback, retry, sorry

**Hypothesis**:
The Station Agent's best guess at the Section a Command meant.
_Avoid_: suggestion, option, candidate
