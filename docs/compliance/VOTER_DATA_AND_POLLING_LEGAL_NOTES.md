# Voter data and door polling: what has been checked, and what hasn't

Written Nov 17, 2026 by Claude, after Caden's standing instruction to verify laws whenever a change may have legal rules
behind it. **This is research notes, not legal advice.** Caden decided counsel doesn't need to confirm before a real voter
file is imported; this file exists so that decision is made with the facts below in front of it. Laws change and differ by
state: re-check a source before relying on it.

It supports the polling proposal in `docs/product/polling-schema-proposal/`, which keeps every column of an imported file
(names, phone numbers, party, vote history) and a source record ID for 30 days, on the platform, for firms' paid crews.

## How to read the evidence
- **Primary** = the text of a statute or regulation, retrieved from the official or a reputable legal-text site. Every quote
  below is a short fragment of the page's own words, but the pages were read through a summarizing tool (which limits quotes
  to short fragments), so check the exact wording on the official page before relying on one.
- **Secondary** = a summary by someone else (NCSL, a law-firm memo, a county notice). Treated as a lead, not a finding.
- **Unchecked** = listed at the end. Absence from this file is not clearance.
- Most primary claims were read by two separate passes (the author's, then an independent verifier's). Where they disagreed the
  author re-read the text, and the disagreements are corrected below. **Read by the verifier only, not re-read by the author:**
  Arizona subsection I and the New Hampshire penalty provision (RSA 664:21), plus the California section 19005 agent and
  discipline details and the section 19008 acknowledgments.

## Primary sources (read)

### Arizona: A.R.S. § 16-168 (azleg.gov/ars/16/00168.htm)
- Subsection E: voter information "may be used only for purposes relating to a political or political party activity" and "a
  political campaign or an election" (district-boundary revision is also listed), and "may not be used for a commercial
  purpose as defined in section 39-121.03." Selling a list to a candidate or a registered political committee for an
  authorized use is not a commercial purpose. The text doesn't mention a campaign's *vendors*.
- Subsection F: a person in possession "shall not distribute, post or otherwise provide access to any portion of that
  information through the internet," except as subsection I allows. The register or list also may not be "used, bought, sold or
  otherwise transferred for any purpose" except for uses otherwise authorized by the section. F also protects specific fields
  from public inspection: Social Security number, driver license number, email address, and birth month and day.
- "A person who violates this subsection or subsection E of this section is guilty of a class 6 felony."
- Subsection I is one sentence: the county recorder and the Secretary of State "shall protect access to voter registration
  information in an auditable format," by the method in the Secretary of State's procedures manual. It is a protection and
  audit duty on those officials. **It does not mention vendors, web applications or authorized users, and it does not itself
  grant anyone internet access.**
- **Why it matters here:** Turfcut is an internet application. Whether an app that lets a firm's authorized staff and crews see
  an Arizona voter file counts as "provid[ing] access through the internet" is not answered by the text, and the penalty is a
  felony. If a full-column import keeps the protected fields (email, Social Security number, driver license number, birth
  month and day), that raises the stakes. I did not find or read the procedures manual.

### California: Title 2 CCR §§ 19003-19013 (law.cornell.edu/regulations/california; sos.ca.gov)
- § 19003: voter registration information "shall be used solely for" seven listed purposes: election, scholarly,
  journalistic, political, governmental, record review (auditing lists, fraud, accuracy), and a vendor's work "compiling or
  organizing the information for another person's use."
- § 19004: impermissible uses include "Any communication for any personal, private, or commercial purpose" outside those
  uses, harassing voters, and sending the information outside the United States.
- § 19005: "Only a vendor may transfer voter registration information to another person," with written notice to the
  Secretary of State before a transfer to a non-agent, and the vendor must pass the § 19012 requirements to the recipient in
  writing. Beneficiaries and vendors may share with their **agents** without prior authorization, and agents may use it only for
  the approved purposes. A vendor that transfers without notice or for an impermissible purpose gets a warning for a first
  violation and, for a second, is barred from providing the information to anyone for the rest of that presidential cycle.
- § 19008: an applicant agrees "not to sell, lease, loan, or deliver possession of the registration information" outside the
  § 19005 exceptions, acknowledges that misuse is a misdemeanor, accepts a per-person penalty, and agrees to report breaches
  immediately.
- § 19012: every holder "must exercise due diligence in maintaining and securing the voter registration information" and must
  "Use a strong and unique password" for each account with access. Every holder must also limit portable devices and, if one
  is used, apply FIPS 197 (AES) storage encryption. **Vendors** must additionally "Encrypt voter registration information
  using FIPS 197 at rest" (backups too) and "Use strong identity and access management, **preferring** multi-factor
  authentication for any and all privilege accounts." Multi-factor authentication is a stated preference for vendors, not a flat
  requirement.
- § 19013: anyone who received the data must report a "detected unauthorized use, suspected breach, or denial of service
  attack" to the Secretary of State Elections Division Help Desk within 24 hours of discovery.
- **Why it matters here:** if a California voter file is imported, Turfcut would be acting as a vendor or as an agent of the
  firm, and which one changes what applies (transfer notice, vendor encryption, discipline). I did not check what Turfcut's
  hosting already provides.
- The statutes behind these rules (Elections Code § 2194, and § 18109 on misuse) could not be retrieved. County notices
  describe § 18109 as a misdemeanor for using the data for another purpose or passing it to another person, and § 19008 itself
  has the applicant acknowledge a misdemeanor. **The statutes are secondary.**

### New Hampshire: RSA 664:16-a, 664:2 XVII and XVIII (gc.nh.gov)
- § 664:16-a: anyone who "engages in push-polling" must, before asking a contacted person a question about a candidate, say the
  call is a "paid political advertisement," name the organization making it and the one paying, give a valid, current, publicly
  listed phone number, and say which candidate it is for or against. The text speaks of "the telephone call." Penalties are
  under RSA 664:21, IV and V (a summary reads IV as a general criminal penalty and V as a civil penalty of up to $1,000
  enforced by the Attorney General; **not confirmed that IV applies to this section**).
- § 664:2, XVII defines push-polling as all of: communications on behalf of or against a candidate or measure "by any means,
  including, but not limited to telephone, text, via the Internet, through social media or digitally"; questions that state,
  imply or convey information about an opposing candidate's character, status, political stance or record; a manner likely to be
  taken for a survey by an entity independent of any party, candidate or interest group, in a series above a size threshold
  (more than 2,000 connected communications under 2 minutes in presidential, gubernatorial, U.S. Senate and U.S. House races;
  more than 500 in executive council, state senate, city, town, school district and village district races; more than 200 in
  state representative races); and "for purposes other than bona fide survey and opinion research."
- § 664:2, XVIII defines bona fide survey and opinion research as data collection on opinions and behaviors "in which no sales,
  promotional, or marketing efforts are involved, and through which there is no attempt to influence a participant's attitudes
  or behavior," and says it includes message testing, "the study for research purposes of how randomly-selected individuals react
  to positive or negative information on a candidate."
- **Door-to-door contact is not named** in XVII; "by any means" is open-ended, so whether in-person contact is covered is
  unresolved by the text. A genuine research poll is outside the definition, but the carve-out is described in terms of
  *randomly selected* individuals and no attempt to influence. A poll given to the households on a firm's walk list is not
  obviously either. I did not search other NH provisions for in-person contact.
- Search summaries add that the FEC (Advisory Opinion 2012-10) and the NH Supreme Court (*Bass Victory Committee*, 2014) found
  the NH disclaimer rule preempted for *federal* candidates. **Secondary; not read.**

## Secondary sources only (leads)
- NCSL, the U.S. Election Assistance Commission, NASS and Ballotpedia describe state voter-file limits: most states prohibit
  commercial use; Ballotpedia (July 2026) counts 15 states with use-restricted availability and 2 with requester-restricted
  availability; typical limits are election or political purposes only, no advertising use, no online posting. Penalties exist
  and vary.
- Colorado Privacy Act: a law-firm memo lists the sensitive-data categories without political opinions, and a 2024 amendment
  added biological and neural data. **The statute text (C.R.S. § 6-1-1303) was not retrieved.**

## Not checked
The other 47 states and D.C.; the Arizona procedures manual (whether a web application counts as providing internet access);
the vendor license terms of the walk apps (NGP VAN, PDI, i360, Ecanvasser) and any state-party terms; whether Turfcut's fees
count as "commercial" use; state privacy laws as they apply to Turfcut as a processor, and the nonprofit exemptions listed in
the plan; breach-notification laws; *Watchtower v. Stratton* and the "No Solicitation" point; AAPOR; federal survey and
disclaimer rules beyond the NH snippet.

## What this suggests for the design (suggestions, not conclusions)
These follow from the primary text above and are for Caden and the W1/W2 session to decide.
1. **State-aware import.** `ImportedAddress.state` is already stored. Warn on, or block until acknowledged, files containing
   states whose rules are stricter than the default (Arizona first: a felony penalty, an internet-access ban, and an open
   question about web applications). W1's `purpose` and `license` fields are where the firm's attestation already lives.
2. **Minimize what "every column" keeps for strict states.** Arizona protects email, Social Security number, driver license
   number and birth month and day in the voter record. Whether to drop those even when "every column" is kept is a decision the
   text points at; it is not a conclusion that keeping them is unlawful.
3. **If California files are accepted:** decide whether Turfcut is a vendor or an agent (it changes what applies); for either,
   strong unique passwords and a 24-hour breach-reporting path to the Secretary of State; as a vendor, encryption at rest (backups
   too) and strong identity management with multi-factor authentication preferred for privileged (staff) accounts; no transfer
   except as a vendor with notice; nothing leaves the United States.
4. **Keep the data in the United States and out of logs.** The database is Supabase us-east-2 (`docs/OPERATIONS.md`) and the
   Vercel region is `cle1` (`vercel.json`). Error reporting (Sentry) must not carry voter columns, and its data region was not
   checked.
5. **Polling disclosures** are a per-jurisdiction rule: the plan's counsel-approved `polling` section in the rule profile (and
   the publish gate) is the right place to hold them. New Hampshire's disclosure binds only "push-polling" as defined, and
   whether a list-based door poll counts as research or as a push poll depends on facts (who pays, what the questions say, whether
   respondents are randomly selected) that the schema can't decide. Nothing here shows a state rule that reaches door polling,
   and nothing shows one that doesn't.
