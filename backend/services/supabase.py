import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()


def get_supabase() -> Client:
    """Return a fresh Supabase client per call.

    No singleton: avoids stale keep-alive connections (httpx RemoteProtocolError)
    that occur when the server closes an idle connection before we reuse it.
    Client creation is cheap — just object instantiation.
    """
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_API_KEY"]
    return create_client(url, key)
