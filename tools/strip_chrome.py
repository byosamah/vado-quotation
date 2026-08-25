import re,sys
CH = re.compile(r"'(Group 3|Straight Connector 5|Rectangle 6|Group 15|Rectangle 1[6-9]|Rectangle 2[0-3]|object 3|Slide Number Placeholder 11)'")
FOOT = re.compile(r"'(Text Box 57|Text Box 58|Text Box 3)' x=(5\d\d|2[67]\d)\.")
for n in sys.argv[1:]:
    lines=open(f'ref/geom-slide{n}.txt').read().split('\n')
    out=[]; sd=None
    for ln in lines:
        ind=len(ln)-len(ln.lstrip())
        if sd is not None:
            if ln.strip() and ind>sd: continue
            sd=None
        tagline = re.search(r'<(sp|grpSp|cxnSp)>', ln)
        if tagline and (CH.search(ln) or FOOT.search(ln)):
            sd=ind; continue
        if tagline and re.search(r"<grpSp> '(Group \d+)' x=55\.4 y=916\.1", ln):
            sd=ind; continue
        out.append(ln)
    print('\n'.join(out))
